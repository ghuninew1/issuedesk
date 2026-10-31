import { DEFAULT_AGENT_ID, authorizeAgent, jsonResponse, readLimitedBody, requestIsTooLarge, serverError, staleAfterSeconds, validateSnapshot } from "../_utils.js";

const INSERT_SNAPSHOT = `
    INSERT INTO network_snapshots (
        id, agent_id, collected_at, received_at, router_identity, router_uptime,
        cpu_load, memory_total_bytes, memory_free_bytes, temperature_c,
        ais_interface, ais_running, ais_ip_address, ais_rx_bytes, ais_tx_bytes,
        true_interface, true_running, true_ip_address, true_rx_bytes, true_tx_bytes, ais_uptime, true_uptime
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

export async function onRequestPost({ request, env }) {
    const authResponse = await authorizeAgent(request, env);
    if (authResponse) return authResponse;
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return jsonResponse({ success: false, message: "Content-Type must be application/json" }, 415);
    }
    if (requestIsTooLarge(request)) return jsonResponse({ success: false, message: "Request body is too large" }, 413);

    let payload;
    try {
        const body = await readLimitedBody(request);
        if (body === null) {
            return jsonResponse({ success: false, message: "Request body is too large" }, 413);
        }
        payload = JSON.parse(body);
    } catch {
        return jsonResponse({ success: false, message: "Request body must be valid JSON" }, 400);
    }

    const validated = validateSnapshot(payload);
    if (validated.error) return jsonResponse({ success: false, message: validated.error }, 400);

    const agentId = DEFAULT_AGENT_ID;
    const receivedAt = new Date().toISOString();
    const { snapshot } = validated;
    const snapshotId = crypto.randomUUID();

    try {
        const previous = await env.DB.prepare(
            `SELECT s.*, st.last_heartbeat_at, st.latest_snapshot_at
             FROM network_agent_state st
             LEFT JOIN network_snapshots s ON s.id = st.latest_snapshot_id
             WHERE st.agent_id = ?`,
        ).bind(agentId).first();

        const existing = await env.DB.prepare(
            "SELECT id FROM network_snapshots WHERE agent_id = ? AND collected_at = ?",
        ).bind(agentId, snapshot.collectedAt).first();
        if (existing) return jsonResponse({ success: false, message: "Snapshot already received" }, 409);

        const insert = env.DB.prepare(INSERT_SNAPSHOT).bind(
            snapshotId, agentId, snapshot.collectedAt, receivedAt,
            snapshot.router.identity, snapshot.router.uptime, snapshot.router.cpuLoad,
            snapshot.router.memoryTotalBytes, snapshot.router.memoryFreeBytes, snapshot.router.temperatureC,
            snapshot.wan.ais.interface, Number(snapshot.wan.ais.running), snapshot.wan.ais.ipAddress,
            snapshot.wan.ais.rxBytes, snapshot.wan.ais.txBytes,
            snapshot.wan.true.interface, Number(snapshot.wan.true.running), snapshot.wan.true.ipAddress,
            snapshot.wan.true.rxBytes, snapshot.wan.true.txBytes, snapshot.wan.ais.uptime, snapshot.wan.true.uptime,
        );
        const updateState = env.DB.prepare(
            `INSERT INTO network_agent_state (agent_id, latest_snapshot_id, latest_snapshot_at, last_heartbeat_at, dhcp_leases_json)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(agent_id) DO UPDATE SET
                latest_snapshot_id = CASE
                    WHEN excluded.latest_snapshot_at >= network_agent_state.latest_snapshot_at THEN excluded.latest_snapshot_id
                    ELSE network_agent_state.latest_snapshot_id END,
                latest_snapshot_at = MAX(network_agent_state.latest_snapshot_at, excluded.latest_snapshot_at),
                last_heartbeat_at = excluded.last_heartbeat_at,
                dhcp_leases_json = CASE WHEN excluded.latest_snapshot_at >= network_agent_state.latest_snapshot_at
                    THEN excluded.dhcp_leases_json ELSE network_agent_state.dhcp_leases_json END`,
        ).bind(agentId, snapshotId, snapshot.collectedAt, receivedAt, snapshot.dhcpLeases === null ? null : JSON.stringify(snapshot.dhcpLeases));

        const statements = [insert, updateState];
        const staleSeconds = staleAfterSeconds(env);
        const recoveredFromOffline = previous?.last_heartbeat_at &&
            new Date(receivedAt).getTime() - new Date(previous.last_heartbeat_at).getTime() > staleSeconds * 1000;
        if (recoveredFromOffline) {
            const offlineAt = new Date(new Date(previous.last_heartbeat_at).getTime() + staleSeconds * 1000).toISOString();
            statements.push(env.DB.prepare(
                "INSERT INTO network_events (id, agent_id, event_type, severity, description, occurred_at) VALUES (?, ?, 'agent_offline', 'warning', 'Network monitoring agent heartbeat timed out', ?)",
            ).bind(crypto.randomUUID(), agentId, offlineAt));
        }
        if (!previous?.last_heartbeat_at || recoveredFromOffline) {
            statements.push(env.DB.prepare(
                "INSERT INTO network_events (id, agent_id, event_type, severity, description, occurred_at) VALUES (?, ?, 'agent_online', 'info', 'Network monitoring agent reported successfully', ?)",
            ).bind(crypto.randomUUID(), agentId, receivedAt));
        }

        const isNewerSnapshot = !previous?.latest_snapshot_at || snapshot.collectedAt > previous.latest_snapshot_at;
        if (previous?.id && isNewerSnapshot) {
            for (const [key, label] of [["ais", "AIS"], ["true", "True"]]) {
                const wasRunning = Boolean(previous[`${key}_running`]);
                const isRunning = snapshot.wan[key].running;
                if (wasRunning !== isRunning) {
                    statements.push(env.DB.prepare(
                        `INSERT INTO network_events (id, agent_id, event_type, severity, description, occurred_at, wan_name)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    ).bind(
                        crypto.randomUUID(), agentId, isRunning ? "wan_up" : "wan_down",
                        isRunning ? "info" : "warning",
                        `${label} PPPoE interface ${isRunning ? "connected" : "disconnected"}`,
                        receivedAt, key,
                    ));
                }
            }
        }

        const cleanupState = await env.DB.prepare(
            "SELECT last_retention_at FROM network_agent_state WHERE agent_id = ?",
        ).bind(agentId).first();
        if (!cleanupState?.last_retention_at || new Date(receivedAt).getTime() - new Date(cleanupState.last_retention_at).getTime() > 86_400_000) {
            statements.push(env.DB.prepare(
                "DELETE FROM network_snapshots WHERE collected_at < ?",
            ).bind(new Date(Date.now() - 30 * 86_400_000).toISOString()));
            statements.push(env.DB.prepare(
                "DELETE FROM network_events WHERE occurred_at < ?",
            ).bind(new Date(Date.now() - 90 * 86_400_000).toISOString()));
            statements.push(env.DB.prepare(
                "UPDATE network_agent_state SET last_retention_at = ? WHERE agent_id = ?",
            ).bind(receivedAt, agentId));
        }

        await env.DB.batch(statements);
        return jsonResponse({ success: true, receivedAt, snapshotId }, 201);
    } catch (error) {
        if (String(error?.message || "").includes("UNIQUE constraint failed: network_snapshots.agent_id, network_snapshots.collected_at")) {
            return jsonResponse({ success: false, message: "Snapshot already received" }, 409);
        }
        return serverError(error, "Failed to save network monitoring snapshot:");
    }
}

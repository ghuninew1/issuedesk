import { requireRole } from "../auth/_utils.js";
import { jsonResponse, serverError, staleAfterSeconds, toSnapshotRow } from "./_utils.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    try {
        const state = await env.DB.prepare(
            `SELECT st.last_heartbeat_at, st.latest_snapshot_at, st.dhcp_leases_json, st.lan_ports_json, s.*
             FROM network_agent_state st
             LEFT JOIN network_snapshots s ON s.id = st.latest_snapshot_id
             WHERE st.agent_id = ?`,
        ).bind("qnap-agent").first();

        const staleSeconds = staleAfterSeconds(env);
        const lastHeartbeatAt = state?.last_heartbeat_at ?? null;
        const ageSeconds = lastHeartbeatAt ? Math.max(0, Math.floor((Date.now() - new Date(lastHeartbeatAt).getTime()) / 1000)) : null;
        return jsonResponse({
            success: true,
            agent: {
                id: "qnap-agent",
                online: ageSeconds !== null && ageSeconds <= staleSeconds,
                lastHeartbeatAt,
                ageSeconds,
                staleAfterSeconds: staleSeconds,
            },
            latestSnapshotAt: state?.latest_snapshot_at ?? null,
            snapshot: toSnapshotRow(state),
            dhcpLeases: state?.dhcp_leases_json ? JSON.parse(state.dhcp_leases_json) : null,
            lanPorts: state?.lan_ports_json ? JSON.parse(state.lan_ports_json) : null,
        });
    } catch (error) {
        return serverError(error, "Failed to load network monitoring status:");
    }
}

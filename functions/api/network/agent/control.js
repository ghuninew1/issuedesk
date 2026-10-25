import { authorizeAgent, jsonResponse, serverError } from "../_utils.js";

export async function onRequestGet({ request, env }) {
    const authResponse = await authorizeAgent(request, env);
    if (authResponse) return authResponse;
    try {
        const now = new Date();
        const nowIso = now.toISOString();
        const retryBefore = new Date(now.getTime() - 120_000).toISOString();
        await env.DB.prepare(
            "UPDATE network_ping_checks SET status = 'pending', started_at = NULL WHERE status = 'running' AND started_at < ?",
        ).bind(retryBefore).run();

        const activeViewer = await env.DB.prepare(
            "SELECT 1 AS active FROM network_monitor_viewers WHERE expires_at > ? LIMIT 1",
        ).bind(nowIso).first();

        let pingJob = null;
        const nextJob = await env.DB.prepare(
            "SELECT id FROM network_ping_checks WHERE status = 'pending' ORDER BY requested_at LIMIT 1",
        ).first();
        if (nextJob) {
            const claim = await env.DB.prepare(
                "UPDATE network_ping_checks SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'",
            ).bind(nowIso, nextJob.id).run();
            if (claim.meta?.changes) {
                const { results } = await env.DB.prepare(
                    "SELECT ip_address AS ipAddress FROM network_ping_results WHERE check_id = ? ORDER BY ip_address",
                ).bind(nextJob.id).all();
                pingJob = { id: nextJob.id, targets: results.map((result) => result.ipAddress) };
            }
        }
        return jsonResponse({ success: true, active: Boolean(activeViewer), pollIntervalSeconds: 30, pingJob });
    } catch (error) {
        return serverError(error, "Failed to read network monitoring demand:");
    }
}

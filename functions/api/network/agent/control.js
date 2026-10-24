import { authorizeAgent, jsonResponse, serverError } from "../_utils.js";

export async function onRequestGet({ request, env }) {
    const authResponse = await authorizeAgent(request, env);
    if (authResponse) return authResponse;
    try {
        const activeViewer = await env.DB.prepare(
            "SELECT 1 AS active FROM network_monitor_viewers WHERE expires_at > ? LIMIT 1",
        ).bind(new Date().toISOString()).first();
        return jsonResponse({ success: true, active: Boolean(activeViewer), pollIntervalSeconds: 30 });
    } catch (error) {
        return serverError(error, "Failed to read network monitoring demand:");
    }
}

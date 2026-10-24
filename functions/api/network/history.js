import { requireRole } from "../auth/_utils.js";
import { jsonResponse, serverError, toSnapshotRow } from "./_utils.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const url = new URL(request.url);
    const hoursText = url.searchParams.get("hours") || "24";
    const limitText = url.searchParams.get("limit") || "3000";
    if (!/^\d+$/.test(hoursText) || !/^\d+$/.test(limitText)) {
        return jsonResponse({ success: false, message: "hours and limit must be integers" }, 400);
    }
    const hours = Number(hoursText);
    const limit = Number(limitText);
    if (hours < 1 || hours > 720 || limit < 1 || limit > 5000) {
        return jsonResponse({ success: false, message: "hours must be 1–720 and limit must be 1–5000" }, 400);
    }
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    try {
        const { results } = await env.DB.prepare(
            `SELECT * FROM network_snapshots
             WHERE agent_id = ? AND collected_at >= ?
             ORDER BY collected_at DESC LIMIT ?`,
        ).bind("qnap-agent", since, limit).all();
        return jsonResponse({
            success: true,
            snapshots: results.map(toSnapshotRow),
            window: { hours, since, until: new Date().toISOString() },
        });
    } catch (error) {
        return serverError(error, "Failed to load network monitoring history:");
    }
}

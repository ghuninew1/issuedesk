import { requireRole } from "../auth/_utils.js";
import { jsonResponse, serverError, staleAfterSeconds } from "./_utils.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const url = new URL(request.url);
    const limitText = url.searchParams.get("limit") || "100";
    if (!/^\d+$/.test(limitText)) return jsonResponse({ success: false, message: "limit must be an integer" }, 400);
    const limit = Number(limitText);
    if (limit < 1 || limit > 500) return jsonResponse({ success: false, message: "limit must be 1–500" }, 400);
    try {
        const [eventRows, state] = await Promise.all([
            env.DB.prepare(
            `SELECT id, event_type AS type, severity, description, occurred_at AS occurredAt, wan_name AS wan
             FROM network_events WHERE agent_id = ? ORDER BY occurred_at DESC LIMIT ?`,
            ).bind("qnap-agent", limit).all(),
            env.DB.prepare("SELECT last_heartbeat_at FROM network_agent_state WHERE agent_id = ?").bind("qnap-agent").first(),
        ]);
        const events = [...eventRows.results];
        const staleSeconds = staleAfterSeconds(env);
        if (state?.last_heartbeat_at && Date.now() - new Date(state.last_heartbeat_at).getTime() > staleSeconds * 1000) {
            events.push({
                id: "current-agent-offline",
                type: "agent_offline",
                severity: "warning",
                description: "Network monitoring agent heartbeat timed out",
                occurredAt: new Date(new Date(state.last_heartbeat_at).getTime() + staleSeconds * 1000).toISOString(),
                wan: null,
                current: true,
            });
        }
        events.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
        return jsonResponse({ success: true, events: events.slice(0, limit) });
    } catch (error) {
        return serverError(error, "Failed to load network monitoring events:");
    }
}

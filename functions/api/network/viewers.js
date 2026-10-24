import { isSameOrigin, requireRole } from "../auth/_utils.js";
import { jsonResponse, readLimitedBody, requestIsTooLarge, serverError } from "./_utils.js";

const VIEWER_LEASE_SECONDS = 90;
const VIEWER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readViewerId(request) {
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return { error: jsonResponse({ success: false, message: "Content-Type must be application/json" }, 415) };
    }
    if (requestIsTooLarge(request)) {
        return { error: jsonResponse({ success: false, message: "Request body is too large" }, 413) };
    }
    try {
        const body = await readLimitedBody(request);
        if (body === null) return { error: jsonResponse({ success: false, message: "Request body is too large" }, 413) };
        const payload = JSON.parse(body);
        if (!payload || typeof payload.viewerId !== "string" || !VIEWER_ID_PATTERN.test(payload.viewerId)) {
            return { error: jsonResponse({ success: false, message: "viewerId must be a UUID v4" }, 400) };
        }
        return { viewerId: payload.viewerId };
    } catch {
        return { error: jsonResponse({ success: false, message: "Request body must be valid JSON" }, 400) };
    }
}

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const parsed = await readViewerId(request);
    if (parsed.error) return parsed.error;

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + VIEWER_LEASE_SECONDS * 1000).toISOString();
    try {
        await env.DB.batch([
            env.DB.prepare("DELETE FROM network_monitor_viewers WHERE expires_at <= ?").bind(nowIso),
            env.DB.prepare(
                `INSERT INTO network_monitor_viewers (viewer_id, expires_at, created_at) VALUES (?, ?, ?)
                 ON CONFLICT(viewer_id) DO UPDATE SET expires_at = excluded.expires_at`,
            ).bind(parsed.viewerId, expiresAt, nowIso),
        ]);
        return jsonResponse({ success: true, expiresAt, leaseSeconds: VIEWER_LEASE_SECONDS });
    } catch (error) {
        return serverError(error, "Failed to renew network monitoring viewer lease:");
    }
}

export async function onRequestDelete({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const parsed = await readViewerId(request);
    if (parsed.error) return parsed.error;
    try {
        await env.DB.prepare("DELETE FROM network_monitor_viewers WHERE viewer_id = ?").bind(parsed.viewerId).run();
        return jsonResponse({ success: true });
    } catch (error) {
        return serverError(error, "Failed to release network monitoring viewer lease:");
    }
}

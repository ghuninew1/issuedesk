import { authorizeAgent, jsonResponse, readLimitedBody, requestIsTooLarge, serverError } from "../_utils.js";

const CHECK_ID_PATTERN = /^[0-9a-f-]{36}$/i;
const IP_PATTERN = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/;

function isAllowedLanIpv4(value) {
    if (typeof value !== "string" || !IP_PATTERN.test(value)) return false;
    const parts = value.split(".").map(Number);
    if (parts.some((part) => part > 255)) return false;
    return parts[0] === 192 && parts[1] === 168 && parts[2] === 11 && parts[3] >= 1 && parts[3] <= 254;
}

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
        if (body === null) return jsonResponse({ success: false, message: "Request body is too large" }, 413);
        payload = JSON.parse(body);
    } catch {
        return jsonResponse({ success: false, message: "Request body must be valid JSON" }, 400);
    }
    if (!payload || typeof payload.checkId !== "string" || !CHECK_ID_PATTERN.test(payload.checkId) ||
        !Array.isArray(payload.results) || payload.results.length < 1 || payload.results.length > 20) {
        return jsonResponse({ success: false, message: "Invalid ping check results" }, 400);
    }

    const seen = new Set();
    for (const result of payload.results) {
        if (!result || !isAllowedLanIpv4(result.ipAddress) || seen.has(result.ipAddress) ||
            !["online", "offline", "error"].includes(result.status) ||
            (result.latencyMs !== null && (typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs) || result.latencyMs < 0 || result.latencyMs > 60_000)) ||
            (result.status === "online" && result.latencyMs === null) ||
            (result.status !== "online" && result.latencyMs !== null)) {
            return jsonResponse({ success: false, message: "A ping result contains invalid address, status, or latency values" }, 400);
        }
        seen.add(result.ipAddress);
    }

    try {
        const check = await env.DB.prepare(
            "SELECT status FROM network_ping_checks WHERE id = ?",
        ).bind(payload.checkId).first();
        if (!check) return jsonResponse({ success: false, message: "Ping check not found" }, 404);
        if (check.status !== "running") return jsonResponse({ success: false, message: "Ping check is not running" }, 409);

        const { results: targets } = await env.DB.prepare(
            "SELECT ip_address FROM network_ping_results WHERE check_id = ?",
        ).bind(payload.checkId).all();
        const expected = new Set(targets.map((target) => target.ip_address));
        if (expected.size !== seen.size || [...seen].some((ipAddress) => !expected.has(ipAddress))) {
            return jsonResponse({ success: false, message: "Ping result targets do not match the queued check" }, 400);
        }

        const checkedAt = new Date().toISOString();
        const statements = payload.results.map((result) => env.DB.prepare(
            "UPDATE network_ping_results SET status = ?, latency_ms = ?, checked_at = ? WHERE check_id = ? AND ip_address = ?",
        ).bind(result.status, result.latencyMs, checkedAt, payload.checkId, result.ipAddress));
        statements.push(env.DB.prepare(
            "UPDATE network_ping_checks SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'running'",
        ).bind(checkedAt, payload.checkId));
        await env.DB.batch(statements);
        return jsonResponse({ success: true, checkId: payload.checkId, completedAt: checkedAt });
    } catch (error) {
        return serverError(error, "Failed to save network ping results:");
    }
}

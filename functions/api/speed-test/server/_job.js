import { jsonResponse } from "../../auth/_utils.js";

const allowedErrors = new Set(["cli_failed", "invalid_result", "timeout", "agent_disconnected"]);
const terminalStates = new Set(["complete", "cancelled", "failed"]);

export function enabled(env) {
    return env.SPEED_TEST_SERVER_ENABLED === "true" && /^[a-f0-9]{64}$/i.test(env.SPEED_TEST_SERVER_AGENT_TOKEN ?? "");
}

export function unavailable() {
    return jsonResponse({ message: "Server Internet Test is unavailable" }, 503);
}

export async function expireJob(db, now) {
    await db.prepare(`
        UPDATE speed_test_server_job SET state = 'expired', error = 'timeout'
        WHERE slot = 1 AND state IN ('queued', 'running', 'cancelling') AND expires_at <= ?
    `).bind(now).run();
}

export function sanitizeResult(value) {
    const { download, upload, latency, jitter, serverName } = value ?? {};
    if (!Number.isFinite(download) || download <= 0 || !Number.isFinite(upload) || upload <= 0 ||
        !Number.isFinite(latency) || latency < 0 || !Number.isFinite(jitter) || jitter < 0 ||
        typeof serverName !== "string" || serverName.length > 100 || !serverName.trim() || /\p{Cc}/u.test(serverName)) {
        return null;
    }
    return { download, upload, latency, jitter, serverName };
}

export function completion(body) {
    if (!terminalStates.has(body.state)) return null;
    const result = body.state === "complete" ? sanitizeResult(body.result) : null;
    if (body.state === "complete" && !result) return null;
    const error = body.state === "failed" ? body.error : null;
    if (body.state === "failed" && !allowedErrors.has(error)) return null;
    return { result: result ? JSON.stringify(result) : null, error };
}

export function isId(value) {
    return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
}

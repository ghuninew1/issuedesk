import { jsonResponse, sha256 } from "../../auth/_utils.js";
import { completion, enabled, expireJob, isId, unavailable } from "./_job.js";

const runWindowMs = 60_000;

async function authorize(request, env) {
    const supplied = /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!supplied) return false;
    const [expected, actual] = await Promise.all([sha256(env.SPEED_TEST_SERVER_AGENT_TOKEN), sha256(supplied)]);
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
    return diff === 0;
}

async function readCommand(request) {
    if (request.headers.get("Content-Type") !== "application/json" || !request.body) return null;
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let text = "";
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) return JSON.parse(text + decoder.decode());
            size += value.byteLength;
            if (size > 2048) {
                await reader.cancel();
                return null;
            }
            text += decoder.decode(value, { stream: true });
        }
    } catch {
        return null;
    } finally {
        reader.releaseLock();
    }
}

export async function onRequestPost({ request, env }) {
    if (!enabled(env)) return unavailable();
    if (!await authorize(request, env)) return jsonResponse({ message: "Agent authentication required" }, 401);
    const body = await readCommand(request);
    if (!body || !["claim", "poll", "complete"].includes(body.action)) {
        return jsonResponse({ message: "Invalid agent command" }, 400);
    }
    const now = Date.now();
    let operation = "expire";
    try {
        await expireJob(env.DB, now);
        operation = body.action;
        if (body.action === "claim") {
            const lease = crypto.randomUUID();
            const job = await env.DB.prepare(`
                UPDATE speed_test_server_job SET state = 'running', lease = ?, expires_at = ?
                WHERE slot = 1 AND state = 'queued' AND expires_at > ?
                RETURNING id, lease
            `).bind(lease, now + runWindowMs, now).first();
            return jsonResponse({ job });
        }
        if (!isId(body.id) || !isId(body.lease)) return jsonResponse({ message: "Invalid job lease" }, 400);
        if (body.action === "poll") {
            const job = await env.DB.prepare(`
                SELECT state FROM speed_test_server_job
                WHERE slot = 1 AND id = ? AND lease = ? AND expires_at > ? AND state IN ('running', 'cancelling')
            `).bind(body.id, body.lease, now).first();
            return jsonResponse({ stop: job?.state !== "running" });
        }
        const output = completion(body);
        if (!output) return jsonResponse({ message: "Invalid completion result" }, 400);
        const updated = await env.DB.prepare(`
            UPDATE speed_test_server_job SET
                state = CASE WHEN state = 'cancelling' THEN 'cancelled' ELSE ? END,
                result = CASE WHEN state = 'cancelling' THEN NULL ELSE ? END,
                error = CASE WHEN state = 'cancelling' THEN NULL ELSE ? END
            WHERE slot = 1 AND id = ? AND lease = ? AND expires_at > ? AND state IN ('running', 'cancelling')
        `).bind(body.state, output.result, output.error, body.id, body.lease, now).run();
        return updated.meta?.changes === 1 ? jsonResponse({ accepted: true }) : jsonResponse({ message: "Job lease closed" }, 409);
    } catch (error) {
        const detail = [error?.message, error?.cause?.message].filter((value) => typeof value === "string").join("\n");
        let reason = "unexpected_error";
        if (typeof env.DB?.prepare !== "function") reason = "missing_db_binding";
        else if (/\b(?:no such table|no such column|has no column named)\b/i.test(detail)) reason = "schema_mismatch";
        else if (/\bD1_ERROR\b/.test(detail)) reason = "d1_error";
        console.error("Server Speed Test agent command failed", { operation, reason });
        return unavailable();
    }
}

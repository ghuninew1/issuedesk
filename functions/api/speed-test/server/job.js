import { isSameOrigin, jsonResponse, requireRole } from "../../auth/_utils.js";
import { enabled, expireJob, isId, unavailable } from "./_job.js";

const queueMs = 15_000;

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    if (!enabled(env)) return jsonResponse({ enabled: false });
    try {
        await expireJob(env.DB, Date.now());
        const row = await env.DB.prepare(
            "SELECT id, state, result, error FROM speed_test_server_job WHERE slot = 1 AND requested_by = ?",
        ).bind(auth.user.id).first();
        return jsonResponse({ enabled: true, job: row ? { ...row, result: row.result ? JSON.parse(row.result) : null } : null });
    } catch {
        return unavailable();
    }
}

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    if (!enabled(env)) return unavailable();
    if (request.body || new URL(request.url).search) return jsonResponse({ message: "Start accepts no parameters" }, 400);
    const now = Date.now();
    const id = crypto.randomUUID();
    try {
        const admission = await env.DB.prepare(`
            INSERT INTO speed_test_server_job (slot, id, requested_by, state, expires_at)
            VALUES (1, ?, ?, 'queued', ?)
            ON CONFLICT(slot) DO UPDATE SET id = excluded.id, requested_by = excluded.requested_by,
                state = excluded.state, expires_at = excluded.expires_at, lease = NULL, result = NULL, error = NULL
            WHERE speed_test_server_job.expires_at <= ?
               OR speed_test_server_job.state IN ('complete', 'cancelled', 'failed', 'expired')
        `).bind(id, auth.user.id, now + queueMs, now).run();
        if (admission.meta?.changes !== 1) return jsonResponse({ message: "A Server Internet Test is already active" }, 409);
        return jsonResponse({ job: { id, state: "queued" } }, 202);
    } catch {
        return unavailable();
    }
}

export async function onRequestDelete({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    if (!enabled(env)) return unavailable();
    const id = new URL(request.url).searchParams.get("id");
    if (!isId(id)) return jsonResponse({ message: "Invalid job ID" }, 400);
    try {
        await expireJob(env.DB, Date.now());
        const row = await env.DB.prepare(`
            UPDATE speed_test_server_job
            SET state = CASE state WHEN 'queued' THEN 'cancelled' WHEN 'running' THEN 'cancelling' ELSE state END
            WHERE slot = 1 AND id = ? AND requested_by = ?
            RETURNING id, state
        `).bind(id, auth.user.id).first();
        return row ? jsonResponse({ job: row }) : jsonResponse({ message: "Job not found" }, 404);
    } catch {
        return unavailable();
    }
}

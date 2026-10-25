import { isSameOrigin, requireRole } from "../../auth/_utils.js";
import { jsonResponse, readLimitedBody, requestIsTooLarge, serverError } from "../_utils.js";

const MAX_TARGETS = 20;

function isAllowedLanIpv4(value) {
    if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return false;
    const parts = value.split(".").map(Number);
    if (parts.some((part) => part > 255)) return false;
    return parts[0] === 192 && parts[1] === 168 && parts[2] === 11 && parts[3] >= 1 && parts[3] <= 254;
}

async function readPayload(request) {
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return { error: jsonResponse({ success: false, message: "Content-Type must be application/json" }, 415) };
    }
    if (requestIsTooLarge(request)) return { error: jsonResponse({ success: false, message: "Request body is too large" }, 413) };
    try {
        const body = await readLimitedBody(request);
        if (body === null) return { error: jsonResponse({ success: false, message: "Request body is too large" }, 413) };
        const payload = JSON.parse(body);
        if (!Array.isArray(payload?.targets) || payload.targets.length < 1 || payload.targets.length > MAX_TARGETS) {
            return { error: jsonResponse({ success: false, message: `Provide between 1 and ${MAX_TARGETS} IPv4 addresses` }, 400) };
        }
        const targets = [...new Set(payload.targets.map((target) => typeof target === "string" ? target.trim() : target))];
        if (targets.length !== payload.targets.length || targets.some((target) => !isAllowedLanIpv4(target))) {
            return { error: jsonResponse({ success: false, message: "Targets must be unique IPv4 addresses in 192.168.11.1–254" }, 400) };
        }
        if (payload.recheck !== undefined && typeof payload.recheck !== "boolean") {
            return { error: jsonResponse({ success: false, message: "recheck must be a boolean" }, 400) };
        }
        return { targets, recheck: payload.recheck === true };
    } catch {
        return { error: jsonResponse({ success: false, message: "Request body must be valid JSON" }, 400) };
    }
}

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const parsed = await readPayload(request);
    if (parsed.error) return parsed.error;

    const now = new Date().toISOString();
    const checkId = crypto.randomUUID();
    try {
        const activeCheck = await env.DB.prepare(
            "SELECT id FROM network_ping_checks WHERE status IN ('pending', 'running') LIMIT 1",
        ).first();
        if (activeCheck) return jsonResponse({ success: false, message: "A ping check is already in progress" }, 409);

        const existingTargets = await env.DB.prepare(
            `SELECT DISTINCT ip_address FROM network_ping_results
             WHERE ip_address IN (${parsed.targets.map(() => "?").join(", ")})`,
        ).bind(...parsed.targets).all();
        const existingIps = new Set(existingTargets.results.map((target) => target.ip_address));
        if (!parsed.recheck && existingIps.size) {
            return jsonResponse({
                success: false,
                message: `มี IP นี้อยู่ในรายการแล้ว: ${[...existingIps].join(", ")}`,
                duplicateTargets: [...existingIps],
            }, 409);
        }
        if (parsed.recheck && parsed.targets.some((target) => !existingIps.has(target))) {
            return jsonResponse({ success: false, message: "Recheck is only available for saved IP addresses" }, 400);
        }

        const statements = [
            env.DB.prepare(
                "INSERT INTO network_ping_checks (id, status, requested_by, requested_at) VALUES (?, 'pending', ?, ?)",
            ).bind(checkId, auth.user.id, now),
            ...parsed.targets.map((ipAddress) => env.DB.prepare(
                "INSERT INTO network_ping_results (id, check_id, ip_address, status) VALUES (?, ?, ?, 'pending')",
            ).bind(crypto.randomUUID(), checkId, ipAddress)),
            env.DB.prepare("DELETE FROM network_ping_results WHERE check_id IN (SELECT id FROM network_ping_checks WHERE requested_at < ?)")
                .bind(new Date(Date.now() - 30 * 86_400_000).toISOString()),
            env.DB.prepare("DELETE FROM network_ping_checks WHERE requested_at < ?")
                .bind(new Date(Date.now() - 30 * 86_400_000).toISOString()),
        ];
        await env.DB.batch(statements);
        return jsonResponse({ success: true, checkId, status: "pending", targets: parsed.targets }, 202);
    } catch (error) {
        return serverError(error, "Failed to queue network ping check:");
    }
}

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    let checkId = new URL(request.url).searchParams.get("id") || "";
    if (checkId && !/^[0-9a-f-]{36}$/i.test(checkId)) return jsonResponse({ success: false, message: "A valid check id is required" }, 400);
    try {
        if (!checkId) {
            const latest = await env.DB.prepare(
                "SELECT id FROM network_ping_checks ORDER BY requested_at DESC LIMIT 1",
            ).first();
            if (!latest) return jsonResponse({ success: true, check: null, knownTargets: [] });
            checkId = latest.id;
        }
        const [check, { results }, { results: knownTargets }] = await Promise.all([
            env.DB.prepare(
                "SELECT id, status, requested_at AS requestedAt, completed_at AS completedAt FROM network_ping_checks WHERE id = ?",
            ).bind(checkId).first(),
            env.DB.prepare(
                "SELECT ip_address AS ipAddress, status, latency_ms AS latencyMs, checked_at AS checkedAt FROM network_ping_results WHERE check_id = ? ORDER BY ip_address",
            ).bind(checkId).all(),
            env.DB.prepare(
                `WITH ranked_targets AS (
                    SELECT r.ip_address AS ipAddress, r.status, r.latency_ms AS latencyMs, r.checked_at AS checkedAt,
                        ROW_NUMBER() OVER (
                            PARTITION BY r.ip_address
                            ORDER BY COALESCE(r.checked_at, c.requested_at) DESC, c.requested_at DESC
                        ) AS target_order
                    FROM network_ping_results r
                    JOIN network_ping_checks c ON c.id = r.check_id
                 )
                 SELECT ipAddress, status, latencyMs, checkedAt FROM ranked_targets WHERE target_order = 1 ORDER BY ipAddress`,
            ).all(),
        ]);
        if (!check) return jsonResponse({ success: false, message: "Ping check not found" }, 404);
        return jsonResponse({ success: true, check: { ...check, results }, knownTargets });
    } catch (error) {
        return serverError(error, "Failed to load network ping check:");
    }
}

export async function onRequestDelete({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const ipAddress = new URL(request.url).searchParams.get("ip") || "";
    if (!isAllowedLanIpv4(ipAddress)) return jsonResponse({ success: false, message: "A valid 192.168.11.x IPv4 address is required" }, 400);

    try {
        const activeCheck = await env.DB.prepare(
            `SELECT c.id FROM network_ping_checks c
             JOIN network_ping_results r ON r.check_id = c.id
             WHERE r.ip_address = ? AND c.status IN ('pending', 'running') LIMIT 1`,
        ).bind(ipAddress).first();
        if (activeCheck) return jsonResponse({ success: false, message: "Cannot delete an IP while its ping check is in progress" }, 409);

        await env.DB.batch([
            env.DB.prepare("DELETE FROM network_ping_results WHERE ip_address = ?").bind(ipAddress),
            env.DB.prepare(
                "DELETE FROM network_ping_checks WHERE status = 'completed' AND NOT EXISTS (SELECT 1 FROM network_ping_results WHERE check_id = network_ping_checks.id)",
            ),
        ]);
        return jsonResponse({ success: true, ipAddress });
    } catch (error) {
        return serverError(error, "Failed to delete network ping history:");
    }
}

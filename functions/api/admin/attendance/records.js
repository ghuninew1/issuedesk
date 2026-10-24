import { requireRole, jsonResponse } from "../../auth/_utils.js";
import { serverError } from "../../attendance/_utils.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") || "30", 10) || 30));
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const now = new Date().toISOString();
    const date = url.searchParams.get("date") || "";
    const query = (url.searchParams.get("q") || "").trim().slice(0, 100);
    if ((date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) return jsonResponse({ success: false, message: "Invalid date filter" }, 400);
    const conditions = [];
    const binds = [];
    if (date) { conditions.push("a.work_date = ?"); binds.push(date); }
    if (query) { conditions.push("(u.name LIKE ? OR u.email LIKE ?)"); binds.push(`%${query}%`, `%${query}%`); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    try {
        const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM attendance_records a JOIN users u ON u.id = a.user_id ${where}`).bind(...binds).first();
        const { results } = await env.DB.prepare(`SELECT a.id, a.user_id, u.name, u.email, a.work_date, a.check_in_at, a.check_out_at, a.status,
            CAST(CASE
                WHEN a.check_in_at IS NOT NULL AND a.check_out_at IS NOT NULL THEN MAX(0, (julianday(a.check_out_at) - julianday(a.check_in_at)) * 86400)
                WHEN a.status = 'working' AND a.work_date = ? AND a.check_in_at IS NOT NULL THEN MAX(0, (julianday(?) - julianday(a.check_in_at)) * 86400)
                ELSE 0 END AS INTEGER) AS work_duration_seconds
            FROM attendance_records a JOIN users u ON u.id = a.user_id ${where} ORDER BY a.work_date DESC, u.name COLLATE NOCASE ASC LIMIT ? OFFSET ?`)
            .bind(today, now, ...binds, limit, (page - 1) * limit).all();
        return jsonResponse({ success: true, records: results, durationAsOf: now, pagination: { page, limit, total: Number(count.total), pages: Math.ceil(Number(count.total) / limit) } });
    } catch (error) { return serverError(error, "Failed to load attendance records:"); }
}

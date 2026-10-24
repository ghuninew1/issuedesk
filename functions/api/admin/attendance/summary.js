import { requireRole, jsonResponse } from "../../auth/_utils.js";
import { serverError } from "../../attendance/_utils.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    try {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        const stats = await env.DB.prepare(`SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'working' AND work_date = ? THEN 1 ELSE 0 END) AS working,
            SUM(CASE WHEN status = 'completed' AND work_date = ? THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'working' AND work_date < ? THEN 1 ELSE 0 END) AS abnormal
            FROM attendance_records`).bind(today, today, today).first();
        return jsonResponse({ success: true, summary: { total: Number(stats.total), working: Number(stats.working), completed: Number(stats.completed), abnormal: Number(stats.abnormal) } });
    } catch (error) { return serverError(error, "Failed to load attendance summary:"); }
}

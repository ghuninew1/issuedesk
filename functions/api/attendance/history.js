import { getSessionUser, jsonResponse } from "../auth/_utils.js";
import { ATTENDANCE_SELECT, serverError } from "./_utils.js";

export async function onRequestGet({ request, env }) {
    const user = await getSessionUser(request, env);
    if (!user) return jsonResponse({ success: false, message: "Authentication required" }, 401);
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const pageSize = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get("limit") || "20", 10) || 20));
    try {
        const { total } = await env.DB.prepare("SELECT COUNT(*) AS total FROM attendance_records WHERE user_id = ?").bind(user.id).first();
        const { results } = await env.DB.prepare(`${ATTENDANCE_SELECT} WHERE user_id = ? ORDER BY work_date DESC LIMIT ? OFFSET ?`)
            .bind(user.id, pageSize, (page - 1) * pageSize).all();
        return jsonResponse({ success: true, records: results, pagination: { page, limit: pageSize, total: Number(total), pages: Math.ceil(Number(total) / pageSize) } });
    } catch (error) { return serverError(error, "Failed to load attendance history:"); }
}

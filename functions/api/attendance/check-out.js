import { getSessionUser, isSameOrigin, jsonResponse } from "../auth/_utils.js";
import { ATTENDANCE_SELECT, bangkokDate, serverError } from "./_utils.js";

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const user = await getSessionUser(request, env);
    if (!user) return jsonResponse({ success: false, message: "Authentication required" }, 401);
    const now = new Date().toISOString();
    try {
        const result = await env.DB.prepare(`UPDATE attendance_records
            SET check_out_at = ?, status = 'completed', updated_at = ?
            WHERE user_id = ? AND work_date = ? AND status = 'working' AND check_in_at IS NOT NULL AND check_out_at IS NULL`)
            .bind(now, now, user.id, bangkokDate(new Date(now))).run();
        if (!result.meta?.changes) return jsonResponse({ success: false, message: "No active attendance record to check out" }, 409);
        const record = await env.DB.prepare(`${ATTENDANCE_SELECT} WHERE user_id = ? AND work_date = ?`)
            .bind(user.id, bangkokDate(new Date(now))).first();
        return jsonResponse({ success: true, record });
    } catch (error) { return serverError(error, "Failed to check out:"); }
}

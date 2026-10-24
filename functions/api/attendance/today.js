import { getSessionUser, jsonResponse } from "../auth/_utils.js";
import { ATTENDANCE_SELECT, bangkokDate, serverError } from "./_utils.js";

export async function onRequestGet({ request, env }) {
    const user = await getSessionUser(request, env);
    if (!user) return jsonResponse({ success: false, message: "Authentication required" }, 401);
    try {
        const record = await env.DB.prepare(`${ATTENDANCE_SELECT} WHERE user_id = ? AND work_date = ?`)
            .bind(user.id, bangkokDate()).first();
        return jsonResponse({ success: true, workDate: bangkokDate(), record: record ?? null });
    } catch (error) { return serverError(error, "Failed to load today's attendance:"); }
}

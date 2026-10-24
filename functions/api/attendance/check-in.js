import { getSessionUser, isSameOrigin, jsonResponse } from "../auth/_utils.js";
import { ATTENDANCE_SELECT, bangkokDate, serverError } from "./_utils.js";

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const user = await getSessionUser(request, env);
    if (!user) return jsonResponse({ success: false, message: "Authentication required" }, 401);
    const now = new Date().toISOString();
    try {
        const inserted = await env.DB.prepare(`
            INSERT INTO attendance_records (id, user_id, work_date, check_in_at, status, updated_at)
            VALUES (?, ?, ?, ?, 'working', ?) ON CONFLICT(user_id, work_date) DO NOTHING
            RETURNING id`)
            .bind(crypto.randomUUID(), user.id, bangkokDate(new Date(now)), now, now).first();
        if (!inserted) return jsonResponse({ success: false, message: "Attendance has already been recorded today" }, 409);
        const record = await env.DB.prepare(`${ATTENDANCE_SELECT} WHERE id = ?`).bind(inserted.id).first();
        return jsonResponse({ success: true, record }, 201);
    } catch (error) { return serverError(error, "Failed to check in:"); }
}

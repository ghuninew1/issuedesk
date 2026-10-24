import { jsonResponse } from "../auth/_utils.js";

export const ATTENDANCE_SELECT = `
    SELECT id, user_id, work_date, check_in_at, check_out_at, status, created_at, updated_at
    FROM attendance_records`;

export function bangkokDate(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

export function serverError(error, label) {
    console.error(label, error);
    return jsonResponse({ success: false, message: "Unable to process attendance request" }, 500);
}

export { jsonResponse };

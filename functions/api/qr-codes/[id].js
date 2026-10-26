import { endpoint, body, validateQR, QR_SELECT, fail, jsonResponse } from "./_utils.js";
async function owned(env, id, user) {
    return env.DB.prepare(`${QR_SELECT} WHERE qr_codes.id = ? AND qr_codes.user_id = ?`).bind(id, user.id).first();
}
export const onRequestGet = endpoint(async ({ env, params, user }) => {
    const item = await owned(env, params.id, user);
    return item ? jsonResponse({ success: true, item }) : fail("NOT_FOUND", "QR Code not found", 404);
});
export const onRequestPatch = endpoint(async ({ request, env, params, user }) => {
    const item = await owned(env, params.id, user);
    if (!item) return fail("NOT_FOUND", "QR Code not found", 404);
    const value = await validateQR({ ...item, ...(await body(request)) }, env, user.id);
    await env.DB.prepare(
        `UPDATE qr_codes SET ${Object.keys(value)
            .map((key) => `${key} = ?`)
            .join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
        .bind(...Object.values(value), new Date().toISOString(), params.id, user.id)
        .run();
    return jsonResponse({ success: true, item: await owned(env, params.id, user) });
}, true);
export const onRequestDelete = endpoint(async ({ env, params, user }) => {
    const result = await env.DB.prepare("DELETE FROM qr_codes WHERE id = ? AND user_id = ?")
        .bind(params.id, user.id)
        .run();
    return result.meta.changes ? jsonResponse({ success: true }) : fail("NOT_FOUND", "QR Code not found", 404);
}, true);

import { endpoint, body, assert, validUrl, fail, jsonResponse } from "../qr-codes/_utils.js";
async function owned(env, id, user) {
    return env.DB.prepare("SELECT * FROM short_links WHERE id = ? AND user_id = ?").bind(id, user.id).first();
}
export const onRequestGet = endpoint(async ({ env, params, user }) => {
    const item = await owned(env, params.id, user);
    return item ? jsonResponse({ success: true, item }) : fail("NOT_FOUND", "Short Link not found", 404);
});
export const onRequestPatch = endpoint(async ({ request, env, params, user }) => {
    const item = await owned(env, params.id, user);
    if (!item) return fail("NOT_FOUND", "Short Link not found", 404);
    const value = await body(request);
    assert(!Object.hasOwn(value, "slug"), "Slug cannot be changed in V1");
    const destination = value.destination_url === undefined ? item.destination_url : value.destination_url;
    const active = value.is_active === undefined ? item.is_active : value.is_active;
    assert(validUrl(destination), "Enter an HTTP(S) destination URL of at most 2048 characters");
    assert([0, 1].includes(active), "is_active must be 0 or 1");
    await env.DB.prepare(
        "UPDATE short_links SET destination_url = ?, is_active = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
        .bind(destination, active, new Date().toISOString(), params.id, user.id)
        .run();
    return jsonResponse({ success: true, item: await owned(env, params.id, user) });
}, true);
export const onRequestDelete = endpoint(async ({ env, params, user }) => {
    if (!(await owned(env, params.id, user))) return fail("NOT_FOUND", "Short Link not found", 404);
    // Guard in the DELETE itself so a concurrent QR save cannot bypass the check.
    const result = await env.DB.prepare(
        "DELETE FROM short_links WHERE id = ? AND user_id = ? AND NOT EXISTS (SELECT 1 FROM qr_codes WHERE short_link_id = ?)",
    )
        .bind(params.id, user.id, params.id)
        .run();
    if (!result.meta.changes) return fail("SHORT_LINK_IN_USE", "A saved QR uses this link. Disable it instead.", 409);
    return jsonResponse({ success: true });
}, true);

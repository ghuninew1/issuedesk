import { endpoint, body, validateQR, pagination, assert, QR_SELECT, jsonResponse } from "./_utils.js";
export const onRequestGet = endpoint(async ({ request, env, user }) => {
    const { query, limit, offset, search } = pagination(request),
        type = query.get("type") || "";
    assert(!type || ["url", "short-link", "text"].includes(type), "Invalid type filter");
    const filter =
        "qr_codes.user_id = ? AND instr(lower(qr_codes.name), lower(?)) > 0 AND (? = '' OR qr_codes.type = ?)";
    const { results } = await env.DB.prepare(
        `${QR_SELECT} WHERE ${filter} ORDER BY qr_codes.created_at DESC, qr_codes.id DESC LIMIT ? OFFSET ?`,
    )
        .bind(user.id, search, type, type, limit, offset)
        .all();
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM qr_codes WHERE ${filter}`)
        .bind(user.id, search, type, type)
        .first();
    return jsonResponse({ success: true, items: results, total: count.total });
});
export const onRequestPost = endpoint(async ({ request, env, user }) => {
    const value = await validateQR(await body(request), env, user.id),
        id = crypto.randomUUID();
    const keys = Object.keys(value);
    await env.DB.prepare(
        `INSERT INTO qr_codes (id, user_id, ${keys.join(", ")}) VALUES (?, ?, ${keys.map(() => "?").join(", ")})`,
    )
        .bind(id, user.id, ...Object.values(value))
        .run();
    return jsonResponse(
        {
            success: true,
            item: await env.DB.prepare(`${QR_SELECT} WHERE qr_codes.id = ? AND qr_codes.user_id = ?`)
                .bind(id, user.id)
                .first(),
        },
        201,
    );
}, true);

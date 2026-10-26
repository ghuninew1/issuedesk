import { endpoint, body, assert, validSlug, validUrl, jsonResponse, fail, pagination } from "../qr-codes/_utils.js";
export const onRequestGet = endpoint(async ({ request, env, user }) => {
    const { limit, offset, search } = pagination(request);
    const filter = "user_id = ? AND (instr(slug, ?) > 0 OR instr(destination_url, ?) > 0)";
    const { results } = await env.DB.prepare(
        `SELECT * FROM short_links WHERE ${filter} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
        .bind(user.id, search, search, limit, offset)
        .all();
    const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM short_links WHERE ${filter}`)
        .bind(user.id, search, search)
        .first();
    return jsonResponse({ success: true, items: results, total: count.total });
});
export const onRequestPost = endpoint(async ({ request, env, user }) => {
    const value = await body(request);
    assert(validUrl(value.destination_url), "Enter an HTTP(S) destination URL of at most 2048 characters");
    const custom = value.slug !== undefined && value.slug !== "";
    if (custom)
        assert(
            validSlug(value.slug),
            "Slug must be 3–50 lowercase letters, digits or single hyphens; reserved names are unavailable",
        );
    for (let attempt = 0; attempt < 5; attempt++) {
        const slug = custom ? value.slug : crypto.randomUUID().replaceAll("-", "").slice(0, 10);
        const id = crypto.randomUUID();
        try {
            await env.DB.prepare("INSERT INTO short_links (id, user_id, slug, destination_url) VALUES (?, ?, ?, ?)")
                .bind(id, user.id, slug, value.destination_url)
                .run();
            return jsonResponse(
                {
                    success: true,
                    item: await env.DB.prepare("SELECT * FROM short_links WHERE id = ? AND user_id = ?")
                        .bind(id, user.id)
                        .first(),
                },
                201,
            );
        } catch (error) {
            if (custom || !/UNIQUE constraint failed: short_links.slug/.test(error.message)) throw error;
        }
    }
    return fail("SLUG_GENERATION_FAILED", "Please try creating the link again", 500);
}, true);

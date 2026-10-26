import { endpoint, validSlug, fail, jsonResponse } from "../qr-codes/_utils.js";
export const onRequestGet = endpoint(async ({ request, env }) => {
    const slug = new URL(request.url).searchParams.get("slug");
    if (!validSlug(slug))
        return fail(
            "INVALID_SLUG",
            "Use 3–50 lowercase letters, digits and single hyphens; reserved names are unavailable",
        );
    const found = await env.DB.prepare("SELECT id FROM short_links WHERE slug = ?").bind(slug).first();
    return jsonResponse({ success: true, available: !found });
});

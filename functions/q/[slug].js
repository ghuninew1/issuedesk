import { validSlug, validUrl } from "../../shared/qr.js";
export async function onRequestGet({ request, env, params }) {
    const headers = { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" };
    if (!validSlug(params.slug)) return new Response("Short Link not found", { status: 404, headers });
    try {
        const link = await env.DB.prepare("SELECT destination_url FROM short_links WHERE slug = ? AND is_active = 1")
            .bind(params.slug)
            .first();
        if (!link || !validUrl(link.destination_url))
            return new Response("Short Link not found", { status: 404, headers });
        return new Response(null, {
            status: 302,
            headers: { Location: new URL(link.destination_url, request.url).href, "Cache-Control": "no-store" },
        });
    } catch {
        return new Response("Unable to load Short Link", { status: 500, headers });
    }
}

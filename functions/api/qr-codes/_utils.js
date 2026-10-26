import { getSessionUser, isSameOrigin, jsonResponse } from "../auth/_utils.js";
import { validUrl, validSlug } from "../../../shared/qr.js";
export { validSlug, validUrl, jsonResponse };
export function fail(code, message, status = 400) {
    return jsonResponse({ success: false, error: { code, message } }, status);
}
export class InputError extends Error {}
export function assert(condition, message) {
    if (!condition) throw new InputError(message);
}
export function endpoint(handler, mutation = false) {
    return async (ctx) => {
        try {
            const user = await getSessionUser(ctx.request, ctx.env);
            if (!user) return fail("UNAUTHENTICATED", "Authentication required", 401);
            if (mutation && !isSameOrigin(ctx.request))
                return fail("INVALID_ORIGIN", "Same-origin request required", 400);
            return await handler({ ...ctx, user });
        } catch (error) {
            if (error instanceof InputError || error instanceof SyntaxError)
                return fail("INVALID_INPUT", error.message);
            if (/UNIQUE constraint failed: short_links.slug/.test(error.message))
                return fail("SLUG_TAKEN", "This slug is already in use", 409);
            console.error("QR Studio request failed:", error);
            return fail("INTERNAL_ERROR", "Unable to complete QR Studio request", 500);
        }
    };
}
export async function body(request) {
    const value = await request.json();
    assert(value && typeof value === "object" && !Array.isArray(value), "Expected a JSON object");
    assert(!Object.hasOwn(value, "user_id"), "user_id must not be supplied");
    return value;
}
export function pagination(request) {
    const query = new URL(request.url).searchParams;
    const limit = Number(query.get("limit") ?? 20),
        offset = Number(query.get("offset") ?? 0);
    assert(
        Number.isInteger(limit) && limit >= 1 && limit <= 100 && Number.isSafeInteger(offset) && offset >= 0,
        "Invalid pagination",
    );
    const search = query.get("search") || "";
    assert(search.length <= 100, "Search is too long");
    return { query, limit, offset, search };
}
export async function validateQR(value, env, userId) {
    assert(
        typeof value.name === "string" && value.name.trim().length > 0 && value.name.length <= 100,
        "Name must contain 1–100 characters",
    );
    assert(["url", "short-link", "text"].includes(value.type), "Invalid QR type");
    const setting = (key, fallback) => value[key] === undefined ? fallback : value[key];
    const result = {
        name: value.name.trim(),
        type: value.type,
        content: null,
        short_link_id: null,
        foreground_color: setting("foreground_color", "#111827"),
        background_color: setting("background_color", "#FFFFFF"),
        error_correction: setting("error_correction", "Q"),
        logo_url: value.logo_url ?? null,
        logo_size: setting("logo_size", 0.2),
        logo_background: setting("logo_background", 1),
    };
    if (result.type === "short-link") {
        assert(typeof value.short_link_id === "string", "Short Link is required");
        const link = await env.DB.prepare("SELECT id FROM short_links WHERE id = ? AND user_id = ?")
            .bind(value.short_link_id, userId)
            .first();
        assert(link, "Short Link is unavailable");
        result.short_link_id = link.id;
    } else {
        assert(typeof value.content === "string" && value.content.trim().length > 0, "Content is required");
        assert(
            result.type === "url" ? validUrl(value.content) : value.content.length <= 2000,
            result.type === "url"
                ? "Enter an HTTP(S) URL of at most 2048 characters"
                : "Text must contain 1–2000 characters",
        );
        result.content = value.content;
    }
    for (const key of ["foreground_color", "background_color"])
        assert(
            typeof result[key] === "string" && /^#[0-9A-Fa-f]{6}$/.test(result[key]),
            "Colors must use six-digit HEX",
        );
    assert(["M", "Q", "H"].includes(result.error_correction), "Invalid error correction");
    assert(
        typeof result.logo_size === "number" &&
            Number.isFinite(result.logo_size) &&
            result.logo_size >= 0.05 &&
            result.logo_size <= 0.4,
        "Logo size must be 0.05–0.40",
    );
    assert([0, 1].includes(result.logo_background), "Logo background must be 0 or 1");
    if (result.logo_url !== null) {
        assert(
            typeof result.logo_url === "string" && /^\/api\/qr-logos\/[a-zA-Z0-9-]+$/.test(result.logo_url),
            "Invalid logo URL",
        );
        const logo = await env.DB.prepare("SELECT id FROM qr_logos WHERE id = ? AND user_id = ?")
            .bind(result.logo_url.split("/").pop(), userId)
            .first();
        assert(logo, "Logo is unavailable");
    }
    return result;
}
export const QR_SELECT =
    "SELECT qr_codes.*, short_links.slug, short_links.is_active AS link_active FROM qr_codes LEFT JOIN short_links ON short_links.id = qr_codes.short_link_id AND short_links.user_id = qr_codes.user_id";

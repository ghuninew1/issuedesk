import { cookieToken, isSameOrigin, jsonResponse, sessionCookie, sha256 } from "./_utils.js";

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Request origin is not allowed" }, 403);
    const token = cookieToken(request);
    if (token) {
        await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
            .bind(new Date().toISOString(), await sha256(token)).run();
    }
    return jsonResponse({ success: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

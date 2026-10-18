import { isSameOrigin, jsonResponse, SESSION_SECONDS, sessionCookie, sha256, verifyPassword } from "./_utils.js";

const MAX_ATTEMPTS = 10;

async function recordAttempt(env, email, success) {
    await env.DB.prepare("INSERT INTO login_attempts (id, email_normalized, attempted_at, success) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), email, new Date().toISOString(), success ? 1 : 0)
        .run();
}

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Request origin is not allowed" }, 403);
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ success: false, message: "Invalid JSON request" }, 400); }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (email.length > 254 || !email || password.length > 128 || !password) {
        return jsonResponse({ success: false, message: "Email and password are required" }, 400);
    }

    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const attemptCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_attempts WHERE email_normalized = ? AND attempted_at >= ?")
        .bind(email, since).first();
    if ((attemptCount?.count ?? 0) >= MAX_ATTEMPTS) return jsonResponse({ success: false, message: "Too many login attempts. Try again later." }, 429);

    const user = await env.DB.prepare("SELECT id, email, name, role, password_hash, is_active FROM users WHERE email = ? COLLATE NOCASE")
        .bind(email).first();
    const valid = Boolean(user && user.is_active === 1 && await verifyPassword(password, user.password_hash));
    await recordAttempt(env, email, valid);
    if (!valid) return jsonResponse({ success: false, message: "Invalid email or password" }, 401);

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    let tokenBinary = "";
    for (const byte of tokenBytes) tokenBinary += String.fromCharCode(byte);
    const token = btoa(tokenBinary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt).run();
    await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), new Date().toISOString(), user.id).run();

    return jsonResponse({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, 200, {
        "Set-Cookie": sessionCookie(token),
    });
}

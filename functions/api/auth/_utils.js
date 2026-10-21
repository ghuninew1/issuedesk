export const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function jsonResponse(data, status = 200, headers = {}) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export function isSameOrigin(request) {
    const origin = request.headers.get("Origin");
    if (!origin) return false;
    try {
        return new URL(origin).origin === new URL(request.url).origin;
    } catch {
        return false;
    }
}

export function cookieToken(request) {
    const value = request.headers.get("Cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith("issuedesk_session="));
    return value ? decodeURIComponent(value.slice("issuedesk_session=".length)) : null;
}

export async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getSessionUser(request, env) {
    const token = cookieToken(request);
    if (!token) return null;
    return env.DB.prepare(
        `SELECT u.id, u.email, u.name, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.is_active = 1`,
    ).bind(await sha256(token), new Date().toISOString()).first();
}

export async function requireRole(request, env, role = "user") {
    const user = await getSessionUser(request, env);
    if (!user) return { response: jsonResponse({ success: false, message: "Authentication required" }, 401) };
    if (role === "admin" && user.role !== "admin") {
        return { response: jsonResponse({ success: false, message: "Administrator access required" }, 403) };
    }
    return { user };
}

function base64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    return Uint8Array.from(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
}

export async function hashPassword(password) {
    // Cloudflare Workers currently supports at most 100,000 PBKDF2 iterations.
    const iterations = 100_000;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
    return `pbkdf2-sha256$${iterations}$${base64Url(salt)}$${base64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
    const [algorithm, rounds, saltText, hashText] = stored.split("$");
    const iterations = Number(rounds);
    if (algorithm !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(saltText), iterations }, key, 256));
    const expected = fromBase64Url(hashText);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
}

export function sessionCookie(token, maxAge = SESSION_SECONDS) {
    return `issuedesk_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export async function createSession(env, userId) {
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    let tokenBinary = "";
    for (const byte of tokenBytes) tokenBinary += String.fromCharCode(byte);
    const token = btoa(tokenBinary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), userId, await sha256(token), expiresAt).run();
    await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), new Date().toISOString(), userId).run();
    return token;
}

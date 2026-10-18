import { hashPassword, isSameOrigin, jsonResponse } from "./_utils.js";
const MAX_ATTEMPTS_PER_HOUR = 5;
const ATTEMPT_WINDOW_MINUTES = 60;

async function recordAttempt(env, id, email, success) {
    await env.DB.prepare(
        "INSERT INTO login_attempts (id, email_normalized, attempted_at, success) VALUES (?, ?, ?, ?)",
    )
        .bind(id, email, new Date().toISOString(), success ? 1 : 0)
        .run();
}

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) {
        return jsonResponse({ success: false, message: "Request origin is not allowed" }, 403);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ success: false, message: "Invalid JSON request" }, 400);
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (
        !name || name.length > 100 ||
        email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        password.length < 12 || password.length > 128
    ) {
        return jsonResponse({ success: false, message: "Name, a valid email, and a password of 12–128 characters are required" }, 400);
    }

    const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
    const attempts = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM login_attempts WHERE email_normalized = ? AND attempted_at >= ?",
    )
        .bind(email, since)
        .first();

    if ((attempts?.count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
        return jsonResponse({ success: false, message: "Too many registration attempts. Try again later." }, 429);
    }

    const attemptId = crypto.randomUUID();
    try {
        const passwordHash = await hashPassword(password);
        const user = await env.DB.prepare(
            "INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'user') RETURNING id, email, name, role, created_at",
        )
            .bind(crypto.randomUUID(), email, name, passwordHash)
            .first();

        await recordAttempt(env, attemptId, email, true);
        return jsonResponse({ success: true, message: "Account created successfully", user }, 201);
    } catch (error) {
        if (error?.message?.includes("UNIQUE constraint failed: users.email")) {
            await recordAttempt(env, attemptId, email, false);
            return jsonResponse({ success: false, message: "An account with this email already exists" }, 409);
        }

        console.error("Failed to register user:", error);
        return jsonResponse({ success: false, message: "Failed to create account" }, 500);
    }
}

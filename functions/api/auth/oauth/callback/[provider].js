import { createSession, hashPassword, sessionCookie } from "../../_utils.js";

const STATE_COOKIE = "issuedesk_oauth_state";

function readCookie(request, name) {
    const item = request.headers.get("Cookie")?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function redirect(url, session = null) {
    const headers = new Headers({ Location: url, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/oauth; Max-Age=0`);
    if (session) headers.append("Set-Cookie", session);
    return new Response(null, { status: 302, headers });
}

function failure(request, reason) {
    const url = new URL("/login", request.url);
    url.searchParams.set("social_error", reason);
    return redirect(url.toString());
}

export async function onRequestGet({ request, params, env }) {
    const url = new URL(request.url);
    const provider = params.provider?.toLowerCase();
    if (!["google", "facebook"].includes(provider)) return failure(request, "provider");
    const state = url.searchParams.get("state");
    const expectedState = readCookie(request, STATE_COOKIE);
    if (!state || !expectedState || state !== expectedState) return failure(request, "state");
    if (url.searchParams.has("error") || !url.searchParams.get("code")) return failure(request, "cancelled");

    const prefix = provider.toUpperCase();
    const clientId = env[`${prefix}_CLIENT_ID`];
    const clientSecret = env[`${prefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) return failure(request, "unconfigured");

    try {
        const callback = `${url.origin}/api/auth/oauth/callback/${provider}`;
        const tokenEndpoint = provider === "google"
            ? "https://oauth2.googleapis.com/token"
            : `https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION || "v26.0"}/oauth/access_token`;
        const tokenParams = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: url.searchParams.get("code"),
            redirect_uri: callback,
            ...(provider === "google" ? { grant_type: "authorization_code" } : {}),
        });
        const tokenResponse = provider === "google"
            ? await fetch(tokenEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
                body: tokenParams,
            })
            : await fetch(`${tokenEndpoint}?${tokenParams}`, { headers: { Accept: "application/json" } });
        if (!tokenResponse.ok) return failure(request, "token");
        const token = await tokenResponse.json();
        if (!token.access_token) return failure(request, "token");

        const profileUrl = provider === "google"
            ? "https://openidconnect.googleapis.com/v1/userinfo"
            : `https://graph.facebook.com/${env.FACEBOOK_GRAPH_API_VERSION || "v26.0"}/me?fields=id,name,email`;
        const profileResponse = await fetch(profileUrl, { headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json" } });
        if (!profileResponse.ok) return failure(request, "profile");
        const profile = await profileResponse.json();
        const email = typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";
        const name = typeof profile.name === "string" ? profile.name.trim().slice(0, 100) : "";
        const providerUserId = typeof profile.sub === "string" ? profile.sub : typeof profile.id === "string" ? profile.id : "";
        if (!email || !name || !providerUserId || (provider === "google" && profile.email_verified !== true)) return failure(request, "email");

        let user = await env.DB.prepare(
            `SELECT u.id, u.email, u.name, u.role, u.is_active
             FROM oauth_accounts a JOIN users u ON u.id = a.user_id
             WHERE a.provider = ? AND a.provider_user_id = ?`,
        ).bind(provider, providerUserId).first();
        if (!user) {
            const existingEmail = await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
            if (existingEmail) return failure(request, "account_exists");
            const userId = crypto.randomUUID();
            try {
                const passwordHash = await hashPassword(Array.from(crypto.getRandomValues(new Uint8Array(48)), (byte) => byte.toString(16).padStart(2, "0")).join(""));
                await env.DB.batch([
                    env.DB.prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'user')")
                        .bind(userId, email, name, passwordHash),
                    env.DB.prepare("INSERT INTO oauth_accounts (id, user_id, provider, provider_user_id) VALUES (?, ?, ?, ?)")
                        .bind(crypto.randomUUID(), userId, provider, providerUserId),
                ]);
                user = await env.DB.prepare("SELECT id, email, name, role, is_active FROM users WHERE id = ?").bind(userId).first();
            } catch (error) {
                const mappedUser = await env.DB.prepare(
                    `SELECT u.id, u.email, u.name, u.role, u.is_active
                     FROM oauth_accounts a JOIN users u ON u.id = a.user_id
                     WHERE a.provider = ? AND a.provider_user_id = ?`,
                ).bind(provider, providerUserId).first();
                if (mappedUser) user = mappedUser;
                else if (error?.message?.includes("UNIQUE constraint failed: users.email")) return failure(request, "account_exists");
                else throw error;
            }
        }
        if (!user || user.is_active !== 1) return failure(request, "inactive");

        const sessionToken = await createSession(env, user.id);
        const destination = new URL(user.role === "admin" ? "/dashboard" : "/", url.origin);
        const response = redirect(destination.toString(), sessionCookie(sessionToken));
        return response;
    } catch (error) {
        console.error("Social authentication failed:", provider, error);
        return failure(request, "failed");
    }
}

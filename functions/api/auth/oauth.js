const STATE_COOKIE = "issuedesk_oauth_state";
const STATE_TTL = 600;

function cookie(name, value, maxAge) {
    return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/oauth; Max-Age=${maxAge}`;
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider")?.toLowerCase();
    if (!["google", "facebook"].includes(provider)) return Response.redirect(new URL("/login?social_error=provider", url.origin), 302);

    const clientId = env[`${provider.toUpperCase()}_CLIENT_ID`];
    const clientSecret = env[`${provider.toUpperCase()}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) return Response.redirect(new URL("/login?social_error=unconfigured", url.origin), 302);

    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const callback = `${url.origin}/api/auth/oauth/callback/${provider}`;
    const graphVersion = env.FACEBOOK_GRAPH_API_VERSION || "v26.0";
    if (provider === "facebook" && !/^v\d+\.\d+$/.test(graphVersion)) {
        return Response.redirect(new URL("/login?social_error=configuration", url.origin), 302);
    }
    const authorization = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : `https://www.facebook.com/${graphVersion}/dialog/oauth`);
    authorization.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callback,
        response_type: "code",
        state,
        scope: provider === "google" ? "openid email profile" : "email,public_profile",
    }).toString();
    if (provider === "google") authorization.searchParams.set("prompt", "select_account");

    return new Response(null, { status: 302, headers: { Location: authorization.toString(), "Set-Cookie": cookie(STATE_COOKIE, state, STATE_TTL), "Cache-Control": "no-store" } });
}

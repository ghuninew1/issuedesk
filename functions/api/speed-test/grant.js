import { isSameOrigin, jsonResponse, requireRole } from "../auth/_utils.js";
import { grantKey, httpsOrigin, issueGrant } from "./_grant.mjs";

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ success: false, message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;

    const origin = httpsOrigin(new URL(request.url).origin);
    const endpoint = httpsOrigin(env.SPEED_TEST_AGENT_ORIGIN);
    const key = env.SPEED_TEST_LAN_ENABLED === "true" && endpoint && origin
        ? await grantKey(env.SPEED_TEST_GRANT_KEY)
        : null;
    if (!key) return jsonResponse({ success: false, message: "LAN Speed Test is unavailable" }, 503);

    return jsonResponse({ success: true, endpoint, token: await issueGrant(key, origin, endpoint) });
}

import { grantKey, httpsOrigin } from "../_grant.mjs";

export async function internetConfig(request, env) {
    if (env.SPEED_TEST_INTERNET_ENABLED !== "true") return null;
    const origin = httpsOrigin(new URL(request.url).origin);
    const endpoint = httpsOrigin(env.SPEED_TEST_INTERNET_ORIGIN);
    if (!origin || !endpoint || endpoint === origin || endpoint === httpsOrigin(env.SPEED_TEST_AGENT_ORIGIN)) {
        return null;
    }
    const secret = env.SPEED_TEST_INTERNET_GRANT_KEY;
    if (secret?.toLowerCase() === env.SPEED_TEST_GRANT_KEY?.toLowerCase()) return null;
    const key = await grantKey(secret);
    return key ? { origin, endpoint, key } : null;
}

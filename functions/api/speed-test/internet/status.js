import { jsonResponse, requireRole } from "../../auth/_utils.js";
import { internetConfig } from "./_config.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const config = await internetConfig(request, env);
    if (!config) return jsonResponse({ endpoint: null });
    try {
        await env.DB.prepare("SELECT 1 FROM speed_test_internet_admissions LIMIT 1").first();
        return jsonResponse({ endpoint: config.endpoint });
    } catch {
        return jsonResponse({ message: "Internet Speed Test is temporarily unavailable" }, 503);
    }
}

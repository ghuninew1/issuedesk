import { isSameOrigin, jsonResponse, requireRole } from "../../auth/_utils.js";
import { issueGrant } from "../_grant.mjs";
import { internetConfig } from "./_config.js";

const minuteMs = 60_000;
const dayMs = 86_400_000;
const dailyGrantLimit = 10;

export async function onRequestPost({ request, env }) {
    if (!isSameOrigin(request)) return jsonResponse({ message: "Invalid request origin" }, 403);
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const config = await internetConfig(request, env);
    if (!config) return jsonResponse({ message: "Internet Speed Test is unavailable" }, 503);

    const now = Date.now();
    try {
        const token = await issueGrant(config.key, config.origin, config.endpoint);
        const [ , admission] = await env.DB.batch([
            env.DB.prepare("DELETE FROM speed_test_internet_admissions WHERE issued_at <= ?").bind(now - dayMs),
            env.DB.prepare(`
                INSERT INTO speed_test_internet_admissions (id, user_id, issued_at)
                SELECT ?, ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM speed_test_internet_admissions WHERE user_id = ? AND issued_at > ?
                ) AND (SELECT COUNT(*) FROM speed_test_internet_admissions) < ?
            `).bind(crypto.randomUUID(), auth.user.id, now, auth.user.id, now - minuteMs, dailyGrantLimit),
        ]);
        if (admission.meta?.changes !== 1) {
            return jsonResponse({ message: "Internet test quota reached. Try again later." }, 429);
        }
        return jsonResponse({ endpoint: config.endpoint, token });
    } catch {
        return jsonResponse({ message: "Internet Speed Test is temporarily unavailable" }, 503);
    }
}

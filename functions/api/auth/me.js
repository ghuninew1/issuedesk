import { getSessionUser, jsonResponse } from "./_utils.js";

export async function onRequestGet({ request, env }) {
    const user = await getSessionUser(request, env);
    if (!user) return jsonResponse({ success: false, message: "Not authenticated" }, 401);
    return jsonResponse({ success: true, user });
}

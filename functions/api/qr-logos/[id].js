import { endpoint, fail } from "../qr-codes/_utils.js";
import { getStorageConfig, storageHeaders, STORAGE_PROJECT_ID } from "../storage/_utils.js";
export const onRequestGet = endpoint(async ({ env, params, user }) => {
    const logo = await env.DB.prepare("SELECT mime_type FROM qr_logos WHERE id = ? AND user_id = ?")
        .bind(params.id, user.id)
        .first();
    if (!logo) return fail("NOT_FOUND", "Logo not found", 404);
    const storage = getStorageConfig(env);
    if (storage.response) return fail("STORAGE_UNAVAILABLE", "Storage configuration is incomplete", 500);
    const response = await fetch(
        `${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files/${encodeURIComponent(params.id)}`,
        { headers: storageHeaders(env) },
    );
    if (!response.ok)
        return fail(
            response.status === 404 ? "NOT_FOUND" : "STORAGE_UNAVAILABLE",
            "Logo unavailable",
            response.status === 404 ? 404 : 500,
        );
    return new Response(response.body, {
        headers: {
            "Content-Type": logo.mime_type,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
});

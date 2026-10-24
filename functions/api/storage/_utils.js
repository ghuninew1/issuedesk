import { requireRole } from "../auth/_utils.js";

export const STORAGE_PROJECT_ID = "6832c1ea-1826-4775-80ef-153bab766e4c";

const REQUIRED_ENV = ["STORAGE_API_URL", "STORAGE_APP_SECRET", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"];

export function jsonResponse(data, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function requireStorageAdmin(request, env) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return { response: auth.response };

    return getStorageConfig(env);
}

export function getStorageConfig(env) {
    const missing = REQUIRED_ENV.filter((key) => typeof env[key] !== "string" || !env[key].trim());
    if (missing.length > 0) {
        console.error("Missing Storage API environment variables:", missing);
        return { response: jsonResponse({ success: false, message: "Storage API configuration is incomplete" }, 500) };
    }
    return { baseUrl: env.STORAGE_API_URL.replace(/\/+$/, "") };
}

export function storageHeaders(env) {
    return {
        "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
        "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
        Authorization: `Bearer ${env.STORAGE_APP_SECRET}`,
    };
}

export function normalizeStorageFile(file) {
    return {
        id: file.id ?? file.fileId ?? file.file_id,
        file_name: file.originalName ?? file.original_name ?? file.fileName ?? file.file_name ?? file.name ?? "Unnamed image",
        mime_type: file.contentType ?? file.content_type ?? file.mimeType ?? file.mime_type ?? file.type ?? "application/octet-stream",
        file_size: file.sizeBytes ?? file.size_bytes ?? file.fileSize ?? file.file_size ?? file.size ?? 0,
        uploaded_at: file.createdAt ?? file.created_at ?? file.uploadedAt ?? file.uploaded_at ?? null,
    };
}

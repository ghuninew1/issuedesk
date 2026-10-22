import {
    jsonResponse,
    normalizeStorageFile,
    requireStorageAdmin,
    STORAGE_PROJECT_ID,
    storageHeaders,
} from "./_utils.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const ALLOWED_FILE_TYPES = new Set([
    ...ALLOWED_INLINE_IMAGE_TYPES,
    "image/svg+xml",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "application/x-rar-compressed",
    "application/vnd.rar",
    "application/x-7z-compressed",
    "application/gzip",
    "application/json",
    "application/xml",
    "application/octet-stream",
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/xml",
    "text/html",
    "text/css",
    "text/javascript",
    "application/javascript",
    "application/vnd.apple.numbers",
    "application/vnd.apple.pages",
    "application/vnd.apple.keynote",
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "video/mp4",
    "video/quicktime",
    "video/webm",
]);

export async function onRequestGet({ request, env }) {
    const storage = await requireStorageAdmin(request, env);
    if (storage.response) return storage.response;

    try {
        const response = await fetch(`${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files`, {
            headers: storageHeaders(env),
        });

        if (!response.ok) {
            console.error("Storage file listing failed:", response.status);
            return jsonResponse({ success: false, message: "Unable to load files from Storage API" }, 502);
        }

        const data = await response.json();
        if (data.success !== true || !Array.isArray(data.files)) {
            return jsonResponse({ success: false, message: "Storage API returned an invalid file list" }, 502);
        }

        const files = data.files.map(normalizeStorageFile).filter((file) => file.id);

        return jsonResponse({
            success: true,
            files,
        });
    } catch (error) {
        console.error("Failed to list Storage API files:", error);
        return jsonResponse({ success: false, message: "Unable to connect to Storage API" }, 502);
    }
}

export async function onRequestPost({ request, env }) {
    const storage = await requireStorageAdmin(request, env);
    if (storage.response) return storage.response;

    if (!request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data")) {
        return jsonResponse({ success: false, message: "Content-Type must be multipart/form-data" }, 415);
    }

    let form;
    try {
        form = await request.formData();
    } catch {
        return jsonResponse({ success: false, message: "Invalid multipart form data" }, 400);
    }

    const file = form.get("file");
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
        return jsonResponse({ success: false, message: "Choose a file to upload" }, 400);
    }
    const mimeType = (file.type || "application/octet-stream").toLowerCase();
    if (!ALLOWED_FILE_TYPES.has(mimeType)) {
        return jsonResponse({ success: false, message: "Unsupported file type" }, 415);
    }
    if (file.size === 0) {
        return jsonResponse({ success: false, message: "Empty files are not allowed" }, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
        return jsonResponse({ success: false, message: "File exceeds the 10 MiB upload limit" }, 413);
    }

    try {
        const storageForm = new FormData();
        storageForm.append("file", file, file.name || "file");

        const response = await fetch(`${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files`, {
            method: "POST",
            headers: storageHeaders(env),
            body: storageForm,
        });

        if (!response.ok) {
            console.error("Storage file upload failed:", response.status);
            return jsonResponse({ success: false, message: "Storage API could not upload the file" }, 502);
        }

        const data = await response.json();
        if (data.success !== true || !data.file || !(data.file.id ?? data.file.fileId ?? data.file.file_id)) {
            return jsonResponse({ success: false, message: "Storage API returned an invalid upload response" }, 502);
        }

        return jsonResponse({ success: true, file: normalizeStorageFile(data.file) }, 201);
    } catch (error) {
        console.error("Failed to upload file to Storage API:", error);
        return jsonResponse({ success: false, message: "Unable to connect to Storage API" }, 502);
    }
}

import {
    jsonResponse,
    normalizeStorageFile,
    requireStorageAdmin,
    STORAGE_PROJECT_ID,
    storageHeaders,
} from "./_utils.js";

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export async function onRequestGet({ request, env }) {
    const storage = await requireStorageAdmin(request, env);
    if (storage.response) return storage.response;

    try {
        const response = await fetch(`${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files`, {
            headers: storageHeaders(env),
        });

        if (!response.ok) {
            console.error("Storage file listing failed:", response.status);
            return jsonResponse({ success: false, message: "Unable to load images from Storage API" }, 502);
        }

        const data = await response.json();
        if (data.success !== true || !Array.isArray(data.files)) {
            return jsonResponse({ success: false, message: "Storage API returned an invalid file list" }, 502);
        }

        const files = data.files.map(normalizeStorageFile).filter((file) => file.id && ALLOWED_IMAGE_TYPES.has(file.mime_type.toLowerCase()));

        return jsonResponse({
            success: true,
            files,
            isTruncated: data.isTruncated === true,
        });
    } catch (error) {
        console.error("Failed to list Storage API images:", error);
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
        return jsonResponse({ success: false, message: "Choose an image to upload" }, 400);
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
        return jsonResponse({ success: false, message: "Supported formats: JPG, PNG, WebP, GIF, and AVIF" }, 415);
    }
    if (file.size === 0) {
        return jsonResponse({ success: false, message: "Empty files are not allowed" }, 400);
    }
    if (file.size > MAX_IMAGE_SIZE) {
        return jsonResponse({ success: false, message: "Image exceeds the 10 MiB upload limit" }, 413);
    }

    try {
        const storageForm = new FormData();
        storageForm.append("file", file, file.name || "image");

        const response = await fetch(`${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files`, {
            method: "POST",
            headers: storageHeaders(env),
            body: storageForm,
        });

        if (!response.ok) {
            console.error("Storage image upload failed:", response.status);
            return jsonResponse({ success: false, message: "Storage API could not upload the image" }, 502);
        }

        const data = await response.json();
        if (data.success !== true || !data.file || !(data.file.id ?? data.file.fileId ?? data.file.file_id)) {
            return jsonResponse({ success: false, message: "Storage API returned an invalid upload response" }, 502);
        }

        return jsonResponse({ success: true, file: normalizeStorageFile(data.file) }, 201);
    } catch (error) {
        console.error("Failed to upload image to Storage API:", error);
        return jsonResponse({ success: false, message: "Unable to connect to Storage API" }, 502);
    }
}

import { endpoint, assert, fail, jsonResponse } from "../qr-codes/_utils.js";
import { getStorageConfig, storageHeaders, STORAGE_PROJECT_ID, normalizeStorageFile } from "../storage/_utils.js";
import { storageFailure, uploadFailure } from "./_storage.js";
import { LOGO_TYPES, MAX_LOGO_SIZE } from "../../../shared/qr.js";
export const onRequestPost = endpoint(async ({ request, env, user }) => {
    const storage = getStorageConfig(env);
    if (storage.response) return fail("STORAGE_UNAVAILABLE", "Storage configuration is incomplete", 500);
    assert(request.headers.get("content-type")?.includes("multipart/form-data"), "Expected multipart form data");
    let form;
    try {
        form = await request.formData();
    } catch {
        return fail("INVALID_INPUT", "Invalid multipart form data");
    }
    assert(!form.has("user_id"), "user_id must not be supplied");
    const file = form.get("file");
    assert(file && typeof file !== "string" && LOGO_TYPES.includes(file.type), "Logo must be PNG, JPEG or WebP");
    assert(file.size > 0 && file.size <= MAX_LOGO_SIZE, "Logo must be at most 2 MB");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png =
        bytes[0] === 137 &&
        bytes[1] === 80 &&
        bytes[2] === 78 &&
        bytes[3] === 71 &&
        bytes[4] === 13 &&
        bytes[5] === 10 &&
        bytes[6] === 26 &&
        bytes[7] === 10;
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
    assert(
        (file.type === "image/png" && png) ||
            (file.type === "image/jpeg" && jpeg) ||
            (file.type === "image/webp" && webp),
        "Image content does not match its type",
    );
    const payload = new FormData();
    payload.append("file", file, file.name || "qr-logo");
    let response;
    try {
        response = await fetch(`${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files`, {
            method: "POST",
            headers: storageHeaders(env),
            body: payload,
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        return storageFailure(null, "STORAGE_CONNECTION_FAILED", "Unable to connect to Storage within 15 seconds. Check Storage availability and connectivity.");
    }
    if (!response.ok) return uploadFailure(response);
    let data;
    try {
        data = await response.json();
    } catch {
        return storageFailure(response, "STORAGE_INVALID_RESPONSE", "Storage returned a non-JSON or invalid response. Check the Storage API URL and Cloudflare Access policy.");
    }
    const uploaded = data?.file && normalizeStorageFile(data.file);
    if (data?.success !== true || !uploaded?.id || !/^[a-zA-Z0-9-]+$/.test(uploaded.id)) {
        return storageFailure(response, "STORAGE_INVALID_RESPONSE", "Storage did not confirm the uploaded logo. Check the Storage API version and logs.");
    }
    try {
        await env.DB.prepare("INSERT INTO qr_logos (id, user_id, mime_type) VALUES (?, ?, ?)")
            .bind(uploaded.id, user.id, file.type)
            .run();
    } catch (error) {
        await fetch(`${storage.baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files/${encodeURIComponent(uploaded.id)}`, {
            method: "DELETE",
            headers: storageHeaders(env),
        }).catch(() => {});
        throw error;
    }
    return jsonResponse({ success: true, logo_url: `/api/qr-logos/${uploaded.id}` }, 201);
}, true);

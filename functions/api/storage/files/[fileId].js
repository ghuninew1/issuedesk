import { jsonResponse, requireStorageAdmin, STORAGE_PROJECT_ID, storageHeaders } from "../_utils.js";

const SAFE_INLINE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function storageFileUrl(baseUrl, fileId) {
    return `${baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files/${encodeURIComponent(fileId)}`;
}

export async function onRequestGet({ request, params, env }) {
    const storage = await requireStorageAdmin(request, env);
    if (storage.response) return storage.response;

    const fileId = params.fileId?.trim();
    if (!fileId) return jsonResponse({ success: false, message: "File ID is required" }, 400);

    try {
        const response = await fetch(storageFileUrl(storage.baseUrl, fileId), { headers: storageHeaders(env) });
        if (!response.ok) {
            return jsonResponse(
                { success: false, message: response.status === 404 ? "Image not found" : "Unable to load image" },
                response.status === 404 ? 404 : 502,
            );
        }
        if (!response.body) return jsonResponse({ success: false, message: "Storage API returned an empty image" }, 502);

        const url = new URL(request.url);
        const isDownload = url.searchParams.get("download") === "1";
        const upstreamMime = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
        if (!isDownload && !SAFE_INLINE_IMAGE_TYPES.has(upstreamMime)) {
            return jsonResponse({ success: false, message: "Only supported raster images can be previewed" }, 415);
        }
        const disposition = isDownload ? "attachment" : "inline";
        const requestedName = url.searchParams.get("name") || "image";
        const fileName = requestedName.replace(/[\\/\r\n\0]/g, "_").slice(0, 180) || "image";
        const headers = new Headers({
            "Content-Type": upstreamMime,
            "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        });
        const contentLength = response.headers.get("content-length");
        if (contentLength) headers.set("Content-Length", contentLength);

        return new Response(response.body, { status: 200, headers });
    } catch (error) {
        console.error("Failed to fetch Storage API image:", error);
        return jsonResponse({ success: false, message: "Unable to connect to Storage API" }, 502);
    }
}

export async function onRequestDelete({ params, request, env }) {
    const storage = await requireStorageAdmin(request, env);
    if (storage.response) return storage.response;

    const fileId = params.fileId?.trim();
    if (!fileId) return jsonResponse({ success: false, message: "File ID is required" }, 400);

    let storageResponse;
    try {
        storageResponse = await fetch(storageFileUrl(storage.baseUrl, fileId), {
            method: "DELETE",
            headers: storageHeaders(env),
        });
    } catch (error) {
        console.error("Failed to delete Storage API image:", error);
        return jsonResponse({ success: false, message: "Unable to connect to Storage API" }, 502);
    }

    if (storageResponse.status !== 404) {
        if (!storageResponse.ok) {
            console.error("Storage image deletion failed:", storageResponse.status);
            return jsonResponse({ success: false, message: "Storage API could not delete the image" }, 502);
        }

        const contentType = storageResponse.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            let data;
            try {
                data = await storageResponse.json();
            } catch {
                return jsonResponse({ success: false, message: "Storage API returned an invalid delete response" }, 502);
            }
            if (data.success !== true) {
                return jsonResponse({ success: false, message: "Storage API did not confirm image deletion" }, 502);
            }
        }
    }

    try {
        await env.DB.prepare("DELETE FROM issue_attachments WHERE storage_file_id = ?").bind(fileId).run();
    } catch (error) {
        console.error("Storage image was deleted but IssueDesk attachment cleanup failed:", fileId, error);
        return jsonResponse(
            { success: false, message: "Image was deleted from Storage API, but linked issue records could not be cleaned" },
            500,
        );
    }

    return jsonResponse({ success: true, message: "Image deleted successfully" });
}

import { fail } from "../qr-codes/_utils.js";

// Never forward upstream response bodies: Access pages and Storage errors can
// contain infrastructure details. Log only bounded, non-sensitive diagnostics.
export function storageFailure(response, code, message) {
    const contentType = response?.headers.get("content-type") || "";
    const ray = response?.headers.get("cf-ray") || "";
    console.error("QR logo Storage request failed", {
        code,
        upstreamStatus: response?.status ?? null,
        responseType: contentType.includes("application/json") ? "json" : contentType.includes("text/html") ? "html" : "other",
        ...(/^[a-zA-Z0-9-]{1,80}$/.test(ray) ? { cfRay: ray } : {}),
    });
    return fail(code, message, 502);
}

export function uploadFailure(response) {
    const status = response.status;
    if ([301, 302, 303, 307, 308].includes(status)) {
        return storageFailure(response, "STORAGE_ACCESS_REDIRECT", "Storage redirected the upload. Check STORAGE_API_URL and Cloudflare Access service-token policy.");
    }
    if ([401, 403].includes(status)) {
        return storageFailure(response, "STORAGE_AUTH_FAILED", `Storage denied the upload (HTTP ${status}). Check STORAGE_APP_SECRET and Cloudflare Access service-token credentials/policy.`);
    }
    if (status === 404) {
        return storageFailure(response, "STORAGE_PROJECT_NOT_FOUND", "Storage upload route/project is unavailable (HTTP 404). Check the Storage API URL, active project and app credential's project access.");
    }
    if (status === 413) {
        return storageFailure(response, "STORAGE_UPLOAD_LIMIT", "Storage rejected the logo size (HTTP 413). Check upload limits on Storage and its proxy.");
    }
    return storageFailure(response, "STORAGE_UPSTREAM_FAILED", `Storage could not upload the logo (HTTP ${status}). Check Storage/Garage service logs.`);
}

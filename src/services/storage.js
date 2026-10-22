import { api } from "../utils/api";

export function getStorageImages(options = {}) {
    return api("/api/storage/files", { signal: options.signal });
}

export function uploadStorageImage(file, options = {}) {
    const formData = new FormData();
    formData.append("file", file);

    return api("/api/storage/files", {
        method: "POST",
        body: formData,
        signal: options.signal,
    });
}

export function uploadStorageFiles(files, options = {}) {
    return Promise.allSettled(files.map((file) => uploadStorageImage(file, options)));
}

export function deleteStorageImage(fileId, options = {}) {
    return api(`/api/storage/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
        signal: options.signal,
    });
}

export function getStorageImageUrl(fileId, download = false, fileName = "") {
    const params = new URLSearchParams();
    if (download) params.set("download", "1");
    if (download && fileName) params.set("name", fileName);
    const suffix = params.size > 0 ? `?${params}` : "";
    return `/api/storage/files/${encodeURIComponent(fileId)}${suffix}`;
}

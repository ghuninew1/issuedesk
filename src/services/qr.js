import { api } from "../utils/api";
export const qrRequest = (path, method = "GET", value, signal) =>
    api(`/api/${path}`, {
        method,
        signal,
        ...(value === undefined
            ? {}
            : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }),
    });
export function uploadQRLogo(file) {
    const form = new FormData();
    form.append("file", file);
    return api("/api/qr-logos", { method: "POST", body: form });
}
export const shortUrl = (slug) => `${window.location.origin}/q/${slug}`;

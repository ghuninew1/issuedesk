export const RESERVED_SLUGS = new Set([
    "api",
    "admin",
    "login",
    "logout",
    "dashboard",
    "report",
    "issues",
    "storage",
    "sheet",
    "attendance",
    "network",
    "qr-studio",
    "q",
]);
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const MAX_LOGO_SIZE = 2 * 1024 * 1024;
export function validSlug(value) {
    return (
        typeof value === "string" &&
        value.length >= 3 &&
        value.length <= 50 &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
        !RESERVED_SLUGS.has(value)
    );
}
export function validUrl(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 2048) return false;
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
    } catch {
        return false;
    }
}
export function downloadName(name) {
    return (
        name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 100) || "issuedesk-qr"
    );
}

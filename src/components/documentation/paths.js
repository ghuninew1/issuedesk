export function resolveDocLink(current, href) {
    if (!href || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) return null;
    const [pathAndQuery, fragment = ""] = href.split("#", 2);
    if (pathAndQuery.includes("?")) return null;
    if (!pathAndQuery) return { path: current, fragment };
    let decoded;
    try { decoded = decodeURIComponent(pathAndQuery); } catch { return null; }
    if (decoded.includes("\\") || decoded.includes("%") || [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;
    const parts = decoded.startsWith("/") ? [] : current.split("/").slice(0, -1);
    for (const part of decoded.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") { if (!parts.length) return null; parts.pop(); }
        else if (part.startsWith(".")) return null;
        else parts.push(part);
    }
    return { path: parts.join("/"), fragment };
}
export const assetUrl = (path) => `/api/docs/asset?path=${encodeURIComponent(path)}`;

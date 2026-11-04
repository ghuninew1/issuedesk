import { requireRole, jsonResponse } from "../auth/_utils.js";

const BASE = "https://api.github.com/repos/ghuninew1/IT-System-Documentation";
const ROOTS = new Set(["00-Overview", "01-Network", "02-Servers", "03-Applications", "04-Security-Backup", "05-Operations"]);
const MAX_BYTES = 5 * 1024 * 1024;
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" };
const fail = (message, status) => jsonResponse({ success: false, message }, status, headers);

function allowed(path, kind) {
    if (typeof path !== "string" || path.length > 1024 || /[\\%]/.test(path) || [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return false;
    const parts = path.split("/");
    if (parts.some((p) => !p || p === "." || p === ".." || p.startsWith("."))) return false;
    if (path !== "README.md" && !ROOTS.has(parts[0])) return false;
    return kind === "content" ? /\.md$/i.test(path) : /\.(png|svg)$/i.test(path);
}

async function github(env, path, accept = "application/vnd.github+json") {
    const response = await fetch(BASE + path, { headers: { Authorization: `Bearer ${env.GITHUB_DOCS_TOKEN}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "IssueDesk-Documentation" }, redirect: "error" });
    if (!response.ok) throw new Error("upstream");
    const length = Number(response.headers.get("content-length"));
    if (length > MAX_BYTES) throw new Error("size");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("body");
    let size = 0;
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("size"); }
        chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
}

async function snapshot(env) {
    const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));
    const commit = decode(await github(env, "/commits/main"));
    if (!/^[a-f0-9]{40}$/.test(commit.sha) || !/^[a-f0-9]{40}$/.test(commit.commit?.tree?.sha)) throw new Error("invalid commit");
    const tree = decode(await github(env, `/git/trees/${commit.commit.tree.sha}?recursive=1`));
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("invalid tree");
    const entries = tree.tree.filter((entry) => entry.type === "blob" && entry.mode === "100644" && /^[a-f0-9]{40}$/.test(entry.sha) && Number.isInteger(entry.size) && entry.size <= MAX_BYTES && (allowed(entry.path, "content") || allowed(entry.path, "asset")));
    return { sha: commit.sha, entries };
}

export async function handleDocs({ request, env }, kind) {
    try {
        const auth = await requireRole(request, env, "admin");
        if (auth.response) return auth.response;
        const url = new URL(request.url);
        const keys = [...url.searchParams.keys()];
        if (kind === "tree" ? keys.length !== 0 : keys.length !== 1 || keys[0] !== "path" || !allowed(url.searchParams.get("path"), kind)) return fail("Invalid request", 400);
        if (!env.GITHUB_DOCS_TOKEN) return fail("Documentation service unavailable", 503);
        const { sha, entries } = await snapshot(env);
        if (kind === "tree") return jsonResponse({ success: true, commit: sha, entries: entries.map(({ path, size }) => ({ path, size })) }, 200, headers);
        const entry = entries.find((item) => item.path === url.searchParams.get("path"));
        if (!entry) return fail("Document not found", 404);
        const bytes = await github(env, `/git/blobs/${entry.sha}`, "application/vnd.github.raw+json");
        if (bytes.length !== entry.size) throw new Error("invalid blob");
        if (kind === "content") return jsonResponse({ success: true, commit: sha, path: entry.path, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }, 200, headers);
        return new Response(bytes, { headers: { ...headers, "Content-Type": entry.path.toLowerCase().endsWith(".png") ? "image/png" : "image/svg+xml", "Content-Disposition": "attachment", "X-Documentation-Commit": sha } });
    } catch {
        return fail("Documentation service unavailable", 502);
    }
}

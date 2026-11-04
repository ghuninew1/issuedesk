import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { onRequestGet as tree } from "../functions/api/docs/tree.js";
import { onRequestGet as content } from "../functions/api/docs/content.js";
import { onRequestGet as asset } from "../functions/api/docs/asset.js";

const sha = "a".repeat(40), treeSha = "b".repeat(40), blob = "c".repeat(40);
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function context(path, role = "admin", token = "secret-value") {
    return { request: new Request(`https://example.test/api/docs/${path}`, { headers: role ? { Cookie: "issuedesk_session=test" } : {} }), env: { GITHUB_DOCS_TOKEN: token, DB: { prepare: () => ({ bind: () => ({ first: async () => role ? { role } : null }) }) } } };
}
function mock() {
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push([url, options]);
        if (url.endsWith("/commits/main")) return Response.json({ sha, commit: { tree: { sha: treeSha } } });
        if (url.includes("/git/trees/")) return Response.json({ tree: [
            { path: "README.md", type: "blob", mode: "100644", sha: blob, size: 5 },
            { path: "01-Network/image.svg", type: "blob", mode: "100644", sha: blob, size: 5 },
            { path: "01-Network/link.md", type: "blob", mode: "120000", sha: blob, size: 5 },
            { path: "AGENTS.md", type: "blob", mode: "100644", sha: blob, size: 5 },
        ] });
        return new Response("hello");
    };
    return calls;
}
test("all endpoints enforce session and admin before upstream access", async () => {
    const calls = mock();
    for (const [fn, path] of [[tree, "tree"], [content, "content?path=README.md"], [asset, "asset?path=01-Network%2Fimage.svg"]]) {
        for (const [role, status] of [[null, 401], ["user", 403]]) {
            const response = await fn(context(path, role));
            assert.equal(response.status, status);
            assert.match(response.headers.get("cache-control"), /no-store/);
        }
    }
    assert.equal(calls.length, 0);
});
test("snapshot exposes only allowed regular files and pinned blobs", async () => {
    const calls = mock();
    const response = await tree(context("tree"));
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.deepEqual((await response.json()).entries.map((e) => e.path), ["README.md", "01-Network/image.svg"]);
    const result = await content(context("content?path=README.md"));
    assert.equal((await result.json()).content, "hello");
    assert.ok(calls.every(([url]) => url.startsWith("https://api.github.com/repos/ghuninew1/IT-System-Documentation/")));
    assert.ok(calls.every(([, options]) => options.redirect === "manual"));
    assert.equal((await content(context("content?path=01-Network%2Flink.md"))).status, 404);
    const image = await asset(context("asset?path=01-Network%2Fimage.svg"));
    assert.equal(image.headers.get("content-disposition"), "attachment");
    assert.match(image.headers.get("content-security-policy"), /sandbox/);
});

test("redirects are rejected without forwarding credentials to their destination", async () => {
    const originalError = console.error;
    const logs = [];
    const calls = [];
    console.error = (...args) => logs.push(args);
    try {
        globalThis.fetch = async (url, options) => {
            calls.push({ url, redirect: options.redirect });
            return new Response(null, { status: 302, headers: { Location: "https://untrusted.example/" } });
        };
        const response = await tree(context("tree"));
        assert.equal(response.status, 502);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].redirect, "manual");
        assert.deepEqual(logs.pop(), ["Documentation API failure", { category: "github_http", status: 302 }]);
    } finally { console.error = originalError; }
});
test("rejects traversal, overrides, duplicate or disallowed paths", async () => {
    const calls = mock();
    for (const path of ["..%2FREADME.md", "%252e%252e%252fREADME.md", "01-Network%2F..%2FREADME.md", "AGENTS.md", "01-Network%2Fsecret.txt", "01-Network%2F.hidden.md", "README.md&ref=other", "README.md&path=README.md"]) {
        assert.equal((await content(context(`content?path=${path}`))).status, 400, path);
    }
    assert.equal((await tree(context("tree?ref=other"))).status, 400);
    assert.equal(calls.length, 0);
});
test("failures are non-cacheable and never expose upstream errors or token", async () => {
    globalThis.fetch = async () => { throw new Error("secret-value upstream response"); };
    const response = await tree(context("tree"));
    assert.equal(response.status, 502);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.doesNotMatch(await response.text(), /secret-value/);
    assert.equal((await tree(context("tree", "admin", ""))).status, 503);
});

test("upstream status and network failures produce sanitized JSON and safe diagnostics", async () => {
    const originalError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);
    try {
        for (const status of [401, 403, 404, 429, 500]) {
            globalThis.fetch = async () => new Response("secret-value upstream body", { status });
            const response = await tree(context("tree"));
            assert.equal(response.status, 502);
            assert.match(response.headers.get("content-type"), /application\/json/);
            assert.deepEqual(await response.json(), { success: false, message: "Documentation service unavailable" });
            assert.deepEqual(logs.pop(), ["Documentation API failure", { category: "github_http", status }]);
        }
        globalThis.fetch = async () => { throw new Error("secret-value issuedesk_session=test Authorization"); };
        for (const [fn, path] of [[tree, "tree"], [content, "content?path=README.md"], [asset, "asset?path=01-Network%2Fimage.svg"]]) {
            const response = await fn(context(path));
            assert.equal(response.status, 502);
            assert.match(response.headers.get("content-type"), /application\/json/);
            assert.doesNotMatch(await response.text(), /secret-value|issuedesk_session|Authorization/);
            const log = logs.pop();
            assert.deepEqual(log, ["Documentation API failure", { category: "github_network", status: null }]);
            assert.doesNotMatch(JSON.stringify(log), /secret-value|issuedesk_session|Authorization/);
        }
        const missing = await tree(context("tree", "admin", ""));
        assert.equal(missing.status, 503);
        assert.deepEqual(logs.pop(), ["Documentation API failure", { category: "missing_configuration", status: null }]);
    } finally { console.error = originalError; }
});

test("GitHub requests use JSON for snapshots and raw bytes for blobs", async () => {
    const calls = mock();
    await content(context("content?path=README.md"));
    assert.deepEqual(calls.map(([, options]) => options.headers.Accept), ["application/vnd.github+json", "application/vnd.github+json", "application/vnd.github.raw+json"]);
    assert.ok(calls.every(([, options]) => options.headers.Authorization === "Bearer secret-value"));
    assert.ok(calls.every(([, options]) => options.headers["X-GitHub-Api-Version"] === "2022-11-28"));
});

test("invalid upstream snapshots and interrupted bodies are classified without their contents", async () => {
    const originalError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args);
    try {
        globalThis.fetch = async () => new Response("secret-value invalid JSON");
        assert.equal((await tree(context("tree"))).status, 502);
        assert.deepEqual(logs.pop(), ["Documentation API failure", { category: "invalid_snapshot", status: null }]);
        globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error("secret-value")); } }));
        assert.equal((await tree(context("tree"))).status, 502);
        assert.deepEqual(logs.pop(), ["Documentation API failure", { category: "github_body", status: null }]);
    } finally { console.error = originalError; }
});

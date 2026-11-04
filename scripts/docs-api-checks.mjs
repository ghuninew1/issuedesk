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
        assert.equal((await fn(context(path, null))).status, 401);
        assert.equal((await fn(context(path, "user"))).status, 403);
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
    assert.ok(calls.every(([, options]) => options.redirect === "error"));
    assert.equal((await content(context("content?path=01-Network%2Flink.md"))).status, 404);
    const image = await asset(context("asset?path=01-Network%2Fimage.svg"));
    assert.equal(image.headers.get("content-disposition"), "attachment");
    assert.match(image.headers.get("content-security-policy"), /sandbox/);
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

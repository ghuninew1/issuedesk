import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./qr-fixture.mjs";
import * as links from "../functions/api/short-links/index.js";
import * as link from "../functions/api/short-links/[id].js";
import * as check from "../functions/api/short-links/check.js";
import * as codes from "../functions/api/qr-codes/index.js";
import * as code from "../functions/api/qr-codes/[id].js";
import * as redirect from "../functions/q/[slug].js";
import * as storageFiles from "../functions/api/storage/files.js";
import * as logos from "../functions/api/qr-logos/index.js";
import * as logo from "../functions/api/qr-logos/[id].js";
import { validSlug, validUrl, downloadName } from "../shared/qr.js";
test("validation rejects unsafe content and invalid slugs", () => {
    for (const value of [
        "javascript:alert(1)",
        "data:text/plain,a",
        "file:///etc/passwd",
        "ftp://example.com",
        "https://u:p@example.com",
        "x".repeat(2049),
    ])
        assert.equal(validUrl(value), false);
    assert.equal(validUrl("https://example.com/a?x=1"), true);
    for (const slug of ["api", "qr-studio", "ABC", "ab", "-abc", "abc-", "a--bc", "a/bc", "a".repeat(51)])
        assert.equal(validSlug(slug), false);
    assert.equal(validSlug("office-it-123"), true);
    assert.equal(downloadName("Office IT"), "office-it");
    assert.equal(downloadName("***"), "issuedesk-qr");
});
test("session, origin, input constraints and logo ownership", async () => {
    const { db, call } = await fixture();
    assert.equal((await call(codes, "GET", undefined, {}, null)).status, 401);
    assert.equal((await call(codes, "POST", {}, {}, "alice", undefined, "https://evil.test")).status, 400);
    for (const value of [
        { user_id: "bob" },
        { name: "n", type: "text", content: "x", logo_size: null },
        { name: "n", type: "text", content: "x", foreground_color: null },
        { name: "n", type: "url", content: "javascript:alert(1)" },
        { name: "n", type: "text", content: "x".repeat(2001) },
        { name: "x".repeat(101), type: "text", content: "x" },
        { name: "n", type: "text", content: "x", foreground_color: "#fff" },
        { name: "n", type: "text", content: "x", error_correction: "L" },
        { name: "n", type: "text", content: "x", logo_size: 0.41 },
        { name: "n", type: "text", content: "x", logo_url: "data:image/png,aaa" },
    ])
        assert.equal((await call(codes, "POST", value)).status, 400);
    db.prepare("INSERT INTO qr_logos (id,user_id,mime_type) VALUES (?,?,?)").run("logo-bob", "bob", "image/png");
    assert.equal(
        (await call(codes, "POST", { name: "n", type: "text", content: "x", logo_url: "/api/qr-logos/logo-bob" }))
            .status,
        400,
    );
    assert.equal((await call(logo, "GET", undefined, { id: "logo-bob" })).status, 404);
    assert.equal((await call(codes, "GET", undefined, {}, "alice", "/api/qr-codes?limit=-1")).status, 400);
    db.close();
});
test("Short Link and QR CRUD, cross-user isolation, reference protection and redirect", async () => {
    const { db, call } = await fixture();
    const created = await call(links, "POST", { slug: "office-it", destination_url: "https://example.com/it" });
    assert.equal(created.status, 201);
    const savedLink = (await created.json()).item;
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run("admin", "bob");
    assert.equal(
        (await call(links, "POST", { slug: "office-it", destination_url: "https://example.com" }, {}, "bob")).status,
        409,
    );
    assert.equal(
        (await (await call(check, "GET", undefined, {}, "bob", "/api/short-links/check?slug=office-it")).json())
            .available,
        false,
    );
    for (const method of ["GET", "PATCH", "DELETE"])
        assert.equal(
            (await call(link, method, method === "PATCH" ? {} : undefined, { id: savedLink.id }, "bob")).status,
            404,
        );
    assert.equal((await call(link, "PATCH", { slug: "changed" }, { id: savedLink.id })).status, 400);
    assert.equal(
        (await call(codes, "POST", { name: "foreign", type: "short-link", short_link_id: savedLink.id }, {}, "bob"))
            .status,
        400,
    );
    const qrResponse = await call(codes, "POST", {
        name: "Office IT",
        type: "short-link",
        short_link_id: savedLink.id,
    });
    assert.equal(qrResponse.status, 201);
    const savedQR = (await qrResponse.json()).item;
    for (const method of ["GET", "PATCH", "DELETE"])
        assert.equal(
            (await call(code, method, method === "PATCH" ? {} : undefined, { id: savedQR.id }, "bob")).status,
            404,
        );
    const refused = await call(link, "DELETE", undefined, { id: savedLink.id });
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).error.code, "SHORT_LINK_IN_USE");
    let response = await call(redirect, "GET", undefined, { slug: "office-it" }, null, "/q/office-it");
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "https://example.com/it");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await call(link, "PATCH", { is_active: 0 }, { id: savedLink.id })).status, 200);
    assert.equal((await call(redirect, "GET", undefined, { slug: "office-it" }, null)).status, 404);
    assert.equal(
        (await call(link, "PATCH", { destination_url: "https://example.com/new", is_active: 1 }, { id: savedLink.id }))
            .status,
        200,
    );
    assert.equal(
        (await call(redirect, "GET", undefined, { slug: "office-it" }, null)).headers.get("Location"),
        "https://example.com/new",
    );
    assert.equal((await call(code, "PATCH", { name: "Renamed" }, { id: savedQR.id })).status, 200);
    assert.equal(
        (
            await (
                await call(codes, "GET", undefined, {}, "alice", "/api/qr-codes?search=renamed&type=short-link")
            ).json()
        ).total,
        1,
    );
    assert.equal((await (await call(codes, "GET", undefined, {}, "bob")).json()).total, 0);
    assert.equal((await call(code, "DELETE", undefined, { id: savedQR.id })).status, 200);
    assert.equal((await call(link, "GET", undefined, { id: savedLink.id })).status, 200);
    assert.equal((await call(link, "DELETE", undefined, { id: savedLink.id })).status, 200);
    assert.equal((await call(redirect, "GET", undefined, { slug: "office-it" }, null)).status, 404);
    const generated = (await (await call(links, "POST", { destination_url: "https://example.com" })).json()).item;
    assert.ok(validSlug(generated.slug));
    db.close();
});
test("database constraints enforce content, type, correction and logo bounds", async () => {
    const { db } = await fixture();
    for (const sql of [
        "INSERT INTO qr_codes(id,user_id,name,type) VALUES('a','alice','a','short-link')",
        "INSERT INTO qr_codes(id,user_id,name,type) VALUES('b','alice','b','text')",
        "INSERT INTO qr_codes(id,user_id,name,type,content,logo_size) VALUES('c','alice','c','text','c',0.5)",
    ])
        assert.throws(() => db.exec(sql), /CHECK constraint/);
    db.close();
});
test("logo upload validates file and reuses Storage contract with private ownership", async () => {
    const { env, db } = await fixture();
    Object.assign(env, {
        STORAGE_API_URL: "https://storage.test",
        STORAGE_APP_SECRET: "test-only",
        CF_ACCESS_CLIENT_ID: "test-only",
        CF_ACCESS_CLIENT_SECRET: "test-only",
    });
    const originalFetch = globalThis.fetch;
    let uploadCount = 0;
    globalThis.fetch = async (url, options) => {
        assert.equal(url, "https://storage.test/v2/projects/6832c1ea-1826-4775-80ef-153bab766e4c/files");
        assert.equal(options.method, "POST");
        assert.ok(options.body instanceof FormData);
        uploadCount++;
        return Response.json({ success: true, file: { id: "test-logo" } });
    };
    try {
        const upload = (bytes, type) => {
            const form = new FormData();
            form.append("file", new File([bytes], "logo.png", { type }));
            return logos.onRequestPost({
                env,
                request: new Request("https://issuedesk.test/api/qr-logos", {
                    method: "POST",
                    headers: { Origin: "https://issuedesk.test", Cookie: "issuedesk_session=alice" },
                    body: form,
                }),
            });
        };
        assert.equal((await upload("invalid", "image/png")).status, 400);
        assert.equal((await upload(new Uint8Array(2 * 1024 * 1024 + 1), "image/png")).status, 400);
        assert.equal((await upload("<svg/>", "image/svg+xml")).status, 400);
        const response = await upload(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png");
        assert.equal(response.status, 201);
        assert.equal((await response.json()).logo_url, "/api/qr-logos/test-logo");
        assert.equal(uploadCount, 1);
        assert.equal(db.prepare("SELECT user_id FROM qr_logos").get().user_id, "alice");
    } finally {
        globalThis.fetch = originalFetch;
        db.close();
    }
});

test("logo upload exposes safe, actionable upstream failures without writing metadata", async () => {
    const { env, db } = await fixture();
    Object.assign(env, {
        STORAGE_API_URL: "https://storage.test", STORAGE_APP_SECRET: "private-test-secret",
        CF_ACCESS_CLIENT_ID: "test-only", CF_ACCESS_CLIENT_SECRET: "test-only",
    });
    const originalFetch = globalThis.fetch, originalError = console.error, logs = [];
    console.error = (...values) => logs.push(values);
    async function upload() {
        const form = new FormData();
        form.append("file", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" }));
        return logos.onRequestPost({ env, request: new Request("https://issuedesk.test/api/qr-logos", {
            method: "POST", headers: { Origin: "https://issuedesk.test", Cookie: "issuedesk_session=alice" }, body: form,
        }) });
    }
    try {
        for (const [status, code] of [[302, "STORAGE_ACCESS_REDIRECT"], [401, "STORAGE_AUTH_FAILED"], [403, "STORAGE_AUTH_FAILED"], [404, "STORAGE_PROJECT_NOT_FOUND"], [413, "STORAGE_UPLOAD_LIMIT"], [502, "STORAGE_UPSTREAM_FAILED"]]) {
            globalThis.fetch = async (_url, options) => {
                assert.equal(options.redirect, "manual"); assert.ok(options.signal);
                return new Response("private-test-secret", { status, headers: { "Content-Type": "text/html", "cf-ray": "abc123-BKK" } });
            };
            const response = await upload();
            assert.equal(response.status, 502);
            const data = await response.json(); assert.equal(data.error.code, code);
            assert.equal(JSON.stringify(data).includes("private-test-secret"), false);
        }
        globalThis.fetch = async () => { throw new Error("private-test-secret"); };
        assert.equal((await (await upload()).json()).error.code, "STORAGE_CONNECTION_FAILED");
        for (const response of [new Response("<html>private-test-secret</html>"), Response.json(null), Response.json({ success: false, message: "private-test-secret" })]) {
            globalThis.fetch = async () => response;
            assert.equal((await (await upload()).json()).error.code, "STORAGE_INVALID_RESPONSE");
        }
        assert.equal(db.prepare("SELECT count(*) AS total FROM qr_logos").get().total, 0);
        assert.equal(JSON.stringify(logs).includes("private-test-secret"), false);
        assert.ok(logs.some((entry) => entry[1].upstreamStatus === 403));
    } finally { globalThis.fetch = originalFetch; console.error = originalError; db.close(); }
});

test("QR logo upload matches StorageImages upstream multipart contract and retains role boundaries", async () => {
    const { env, db } = await fixture();
    db.prepare("UPDATE users SET role = 'admin' WHERE id = 'bob'").run();
    Object.assign(env, {
        STORAGE_API_URL: "https://storage.test",
        STORAGE_APP_SECRET: "test-only",
        CF_ACCESS_CLIENT_ID: "access-id-test-only",
        CF_ACCESS_CLIENT_SECRET: "access-secret-test-only",
    });
    const originalFetch = globalThis.fetch;
    const calls = [];
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    function request(path, user) {
        const form = new FormData();
        form.append("file", new File([imageBytes], "office-logo.png", { type: "image/png" }));
        return new Request(`https://issuedesk.test${path}`, {
            method: "POST",
            headers: { Origin: "https://issuedesk.test", Cookie: `issuedesk_session=${user}` },
            body: form,
        });
    }
    globalThis.fetch = async (url, options) => {
        assert.equal(new Headers(options.headers).has("Content-Type"), false);
        const wireRequest = new Request(url, options);
        assert.match(wireRequest.headers.get("Content-Type"), /^multipart\/form-data; boundary=/);
        const form = await wireRequest.formData();
        assert.deepEqual([...form.keys()], ["file"]);
        const file = form.get("file");
        calls.push({
            url, method: options.method, headers: options.headers,
            file: { name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] },
        });
        return Response.json({ success: true, file: { id: `contract-logo-${calls.length}` } }, { status: 201 });
    };
    try {
        const storage = await storageFiles.onRequestPost({ env, request: request("/api/storage/files", "bob") });
        assert.equal(storage.status, 201);
        const qr = await logos.onRequestPost({ env, request: request("/api/qr-logos", "alice") });
        assert.equal(qr.status, 201);
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0], calls[1]);
        assert.equal(calls[0].url, "https://storage.test/v2/projects/6832c1ea-1826-4775-80ef-153bab766e4c/files");
        assert.deepEqual(calls[0].file.bytes, [...imageBytes]);
        assert.equal(calls[0].headers.Authorization, "Bearer test-only");
        assert.equal(calls[0].headers["CF-Access-Client-Id"], "access-id-test-only");
        assert.equal(calls[0].headers["CF-Access-Client-Secret"], "access-secret-test-only");
        assert.equal(db.prepare("SELECT user_id FROM qr_logos WHERE id = 'contract-logo-2'").get().user_id, "alice");
        // Do not route ordinary QR users through the admin-only management endpoint.
        const forbidden = await storageFiles.onRequestPost({ env, request: request("/api/storage/files", "alice") });
        assert.equal(forbidden.status, 403);
        assert.equal(calls.length, 2);
    } finally {
        globalThis.fetch = originalFetch;
        db.close();
    }
});

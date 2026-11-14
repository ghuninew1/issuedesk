import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { grantKey, issueGrant } from "../functions/api/speed-test/_grant.mjs";
import { createPublicAgent } from "../garage/speed-test-agent/server.mjs";

const origin = "https://issuedesk.test";
const audience = "https://internet.test";
const secret = randomBytes(32).toString("hex");
const chunk = 4 * 1024 * 1024;
const temp = mkdtempSync(join(tmpdir(), "speed-test-public-"));
let tls, key;

before(async () => {
    execFileSync("openssl", ["req", "-new", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1",
        "-keyout", join(temp, "key.pem"), "-out", join(temp, "cert.pem"), "-days", "1"], { stdio: "ignore" });
    tls = { cert: readFileSync(join(temp, "cert.pem")), key: readFileSync(join(temp, "key.pem")) };
    key = await grantKey(secret);
});
after(() => rmSync(temp, { recursive: true, force: true }));

async function fixture(t, requestTimeoutMs = 6_000) {
    const server = await createPublicAgent({ origin, audience, secret, tls, requestTimeoutMs });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const endpoint = `https://127.0.0.1:${server.address().port}`;
    const client = new https.Agent({ ca: tls.cert });
    t.after(() => client.destroy());

    function open(path, { token, method = "GET", from = origin, headers, body, held = false } = {}) {
        let req;
        const result = new Promise((resolve, reject) => {
            req = https.request(endpoint + path, {
                agent: client, method, headers: { Origin: from, ...(token && { Authorization: `Bearer ${token}` }), ...headers },
            }, (res) => {
                let bytes = 0;
                res.on("data", (data) => { bytes += data.length; });
                res.on("end", () => resolve({ code: res.statusCode, headers: res.headers, bytes }));
                res.on("error", reject);
            });
            req.on("error", reject);
            if (held) req.write("x");
            else req.end(body);
        });
        return { req, result };
    }
    return { server, open, request: (...args) => open(...args).result };
}

function signedGrant(expiresAt) {
    const payload = Buffer.from(JSON.stringify({ id: randomUUID(), origin, audience, expiresAt })).toString("base64url");
    return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
        .then((mac) => `${payload}.${Buffer.from(mac).toString("base64url")}`);
}

test("public readiness and CORS expose the Internet contract without a grant", async (t) => {
    const { request } = await fixture(t);
    const ready = await request("/ready");
    assert.equal(ready.code, 204);
    assert.equal(ready.bytes, 0);
    assert.equal(ready.headers["x-issuedesk-speed-test"], "1");
    assert.equal(ready.headers["access-control-allow-origin"], origin);
    assert.match(ready.headers["access-control-expose-headers"], /X-IssueDesk-Speed-Test/);
    assert.equal(ready.headers["cache-control"], "no-store");
    assert.equal((await request("/ready", { from: "https://wrong.test" })).code, 403);
    assert.equal((await request("/ready", { method: "POST" })).code, 405);
    const preflight = { method: "OPTIONS", headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Authorization, Content-Encoding",
        "Access-Control-Request-Private-Network": "true",
    } };
    const cors = await request("/upload", preflight);
    assert.equal(cors.code, 204);
    assert.equal(cors.headers["access-control-allow-methods"], "POST");
    assert.match(cors.headers["access-control-allow-headers"], /Authorization/);
    assert.equal(cors.headers["access-control-allow-private-network"], undefined);
    assert.equal((await request("/upload", { ...preflight, from: "null" })).code, 403);
    assert.equal((await request("/download", preflight)).code, 403);

    for (let i = 1; i < 60; i++) assert.equal((await request("/ready")).code, 204);
    assert.equal((await request("/ready")).code, 429);
});

test("measurement requires the Internet signature, exact origin, audience and unexpired grant", async (t) => {
    const { request } = await fixture(t);
    const token = await issueGrant(key, origin, audience);
    const wrongKey = await grantKey(randomBytes(32).toString("hex"));
    for (const invalid of [
        undefined,
        token.replace(/^./, (char) => char === "a" ? "b" : "a"),
        await issueGrant(wrongKey, origin, audience),
        await issueGrant(key, origin, "https://lan.test"),
        await issueGrant(key, "https://other.test", audience),
        await signedGrant(Date.now() - 1000),
    ]) {
        for (const [path, method] of [["/ping", "GET"], ["/download", "GET"], ["/upload", "POST"]]) {
            const response = await request(path, { token: invalid, method });
            assert.equal(response.code, 401);
            assert.equal(response.bytes, 0);
        }
    }
    assert.equal((await request("/ping", { token, from: "https://other.test" })).code, 403);
    assert.equal((await request("/ping?r=1", { token })).code, 204);
    const upload = { method: "POST", token };
    assert.equal((await request("/upload", { ...upload, headers: { "Content-Length": chunk + 1 } })).code, 413);
    assert.equal((await request("/upload", { ...upload, headers: { "Transfer-Encoding": "chunked" }, body: "x" })).code, 411);
    assert.equal((await request("/upload", { ...upload, headers: { "Content-Encoding": "gzip", "Content-Length": 1 }, body: "x" })).code, 415);
    assert.equal((await request("/upload", { ...upload, headers: { "Content-Length": 1 }, body: "x" })).code, 204);
    for (let i = 1; i < 16; i++) assert.equal((await request("/ping", { token })).code, 204);
    assert.equal((await request("/ping", { token })).code, 429);
});

test("competing grants and parallel connections cannot overspend the download budget", async (t) => {
    const { request, server } = await fixture(t);
    assert.equal(server.maxConnections, 16);
    const tokens = await Promise.all([issueGrant(key, origin, audience), issueGrant(key, origin, audience)]);
    const starts = await Promise.all(tokens.map((token) => request("/ping", { token })));
    assert.deepEqual(starts.map(({ code }) => code).sort(), [204, 409]);
    const token = tokens[starts.findIndex(({ code }) => code === 204)];
    for (let i = 0; i < 95; i++) {
        const response = await request("/download", { token });
        assert.equal(response.code, 200);
        assert.equal(response.bytes, chunk);
        assert.equal(response.headers["content-encoding"], undefined);
        assert.equal(response.headers["cache-control"], "no-store");
    }
    const parallel = await Promise.all(Array.from({ length: 6 }, () => request("/download", { token })));
    assert.equal(parallel.filter(({ code, bytes }) => code === 200 && bytes === chunk).length, 1);
    assert.equal(parallel.filter(({ code, bytes }) => code === 429 && bytes === 0).length, 5);
});

test("cancelled uploads keep their byte charges and release slots; slow transfers time out", async (t) => {
    const { request, open } = await fixture(t, 900);
    const token = await issueGrant(key, origin, audience);
    const upload = { method: "POST", token, headers: { "Content-Length": chunk }, held: true };
    // An admitted partial upload keeps its slot; rejected probes close immediately.
    const holds = Array.from({ length: 3 }, () => open("/upload", upload));
    const rejected = holds.map(({ result }) => assert.rejects(result, { code: "ECONNRESET" }));
    const waitForBusy = async () => {
        for (let i = 0; i < 50; i++) {
            const result = await request("/download", { token });
            if (result.code === 429) return;
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        assert.fail("three held uploads did not occupy the transfer slots");
    };
    await waitForBusy();
    holds[0].req.destroy();
    await rejected[0];
    await Promise.all(rejected.slice(1)); // The remaining slots are freed by the deadline.
    assert.equal((await request("/upload", { method: "POST", token, headers: { "Content-Length": 1 }, body: "x" })).code, 204);
    const body = Buffer.alloc(chunk);
    for (let i = 0; i < 92; i++) {
        assert.equal((await request("/upload", { method: "POST", token, headers: { "Content-Length": chunk }, body })).code, 204);
    }
    const last = await request("/upload", upload);
    assert.equal(last.code, 429);
});

test("small uploads cannot evade the public transfer request ceiling", async (t) => {
    const { request } = await fixture(t);
    const token = await issueGrant(key, origin, audience);
    const upload = { method: "POST", token, headers: { "Content-Length": 1 }, body: "x" };
    for (let i = 0; i < 256; i++) assert.equal((await request("/upload", upload)).code, 204);
    assert.equal((await request("/upload", upload)).code, 429);
    assert.equal((await request("/download", { token })).code, 429);
});

test("agent admission has its own rolling ceiling and expires old grants", async (t) => {
    const { request } = await fixture(t);
    let instant = Date.now();
    let elapsed = performance.now();
    t.mock.method(Date, "now", () => instant);
    t.mock.method(performance, "now", () => elapsed);
    for (let i = 0; i < 10; i++) {
        const token = await issueGrant(key, origin, audience);
        assert.equal((await request("/ping", { token })).code, 204);
        instant += 46_000;
        elapsed += 46_000;
        assert.equal((await request("/ping", { token })).code, 401);
    }
    assert.equal((await request("/ping", { token: await issueGrant(key, origin, audience) })).code, 429);
    instant += 86_400_000;
    elapsed += 86_400_000;
    assert.equal((await request("/ping", { token: await issueGrant(key, origin, audience) })).code, 204);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, before, after } from "node:test";
import { grantKey, issueGrant, verifyGrant } from "../functions/api/speed-test/_grant.mjs";
import { onRequestPost } from "../functions/api/speed-test/grant.js";
import { createAgent } from "../garage/speed-test-agent/server.mjs";

const secret = randomBytes(32).toString("hex");
const origin = "https://issuedesk.test";
const temp = mkdtempSync(join(tmpdir(), "issuedesk-speed-test-"));
let server, endpoint, cert, key;

before(async () => {
    execFileSync("openssl", ["req", "-new", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1",
        "-keyout", join(temp, "key.pem"), "-out", join(temp, "cert.pem"), "-days", "1"], { stdio: "ignore" });
    cert = readFileSync(join(temp, "cert.pem"));
    key = await grantKey(secret);
    server = await createAgent({
        host: "127.0.0.1", clientSubnet: "127.0.0.1/32", origin, audience: "https://agent.test",
        secret, tls: { cert, key: readFileSync(join(temp, "key.pem")) }, requestTimeoutMs: 500,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    endpoint = `https://127.0.0.1:${server.address().port}`;
});
after(async () => {
    server?.closeAllConnections();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    rmSync(temp, { recursive: true, force: true });
});

function context({ role, from = origin, config = {} } = {}) {
    const headers = { Origin: from };
    if (role) headers.Cookie = "issuedesk_session=fixture";
    return {
        request: new Request(`${origin}/api/speed-test/grant`, { method: "POST", headers }),
        env: {
            SPEED_TEST_LAN_ENABLED: "true", SPEED_TEST_AGENT_ORIGIN: "https://agent.test", SPEED_TEST_GRANT_KEY: secret,
            DB: { prepare: () => ({ bind: () => ({ first: async () => ({ role }) }) }) }, ...config,
        },
    };
}

function request(path, { token, method = "GET", from = origin, headers, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(endpoint + path, {
            ca: cert, method, headers: {
                Origin: from, ...(token && { Authorization: `Bearer ${token}` }), ...headers,
            },
        }, (res) => {
            let bytes = 0;
            res.on("data", (chunk) => { bytes += chunk.length; });
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, bytes }));
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end(body);
    });
}

test("grant requires same origin and admin and is disabled by default", async () => {
    assert.equal((await onRequestPost(context({ role: "admin", from: "https://other.test" }))).status, 403);
    assert.equal((await onRequestPost(context())).status, 401);
    assert.equal((await onRequestPost(context({ role: "user" }))).status, 403);
    for (const config of [
        { SPEED_TEST_LAN_ENABLED: undefined },
        { SPEED_TEST_GRANT_KEY: "invalid" },
        { SPEED_TEST_AGENT_ORIGIN: "http://agent.test" },
    ]) {
        assert.equal((await onRequestPost(context({ role: "admin", config }))).status, 503);
    }
    const response = await onRequestPost(context({ role: "admin" }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { token } = await response.json();
    assert.ok(await verifyGrant(key, token, origin, "https://agent.test"));
    assert.equal(await verifyGrant(key, token, origin, "https://unrelated.test"), null);
    assert.equal(await verifyGrant(key, token.replace(/^./, (value) => value === "a" ? "b" : "a"), origin, "https://agent.test"), null);
    const payload = Buffer.from(JSON.stringify({ id: crypto.randomUUID(), origin, audience: "https://agent.test", expiresAt: Date.now() - 1000 })).toString("base64url");
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    assert.equal(await verifyGrant(key, `${payload}.${Buffer.from(signature).toString("base64url")}`, origin, "https://agent.test"), null);
});

test("HTTPS preflights, LAN CIDR enforcement, and grant restrictions", async () => {
    const preflight = {
        method: "OPTIONS",
        headers: {
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Authorization, Content-Encoding",
            "Access-Control-Request-Private-Network": "true",
        },
    };
    const response = await request("/upload", preflight);
    assert.equal(response.status, 204);
    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal(response.headers["access-control-allow-private-network"], "true");
    assert.equal((await request("/upload", { ...preflight, from: "https://wrong.test" })).status, 403);
    assert.equal((await request("/ping", preflight)).status, 403);
    assert.equal((await request("/download")).status, 401);
    assert.equal((await request("/ping", { from: "null" })).status, 403);
    const restricted = await createAgent({
        host: "127.0.0.1", clientSubnet: "192.168.10.0/24", origin, audience: "https://agent.test",
        secret, tls: { cert, key: readFileSync(join(temp, "key.pem")) },
    });
    restricted.listen(0, "127.0.0.1");
    await once(restricted, "listening");
    try {
        const token = await issueGrant(key, origin, "https://agent.test");
        const result = await new Promise((resolve, reject) => {
            https.get(`https://127.0.0.1:${restricted.address().port}/ping`, {
                ca: cert, headers: { Origin: origin, Authorization: `Bearer ${token}`, "X-Forwarded-For": "192.168.10.1" },
            }, (res) => { res.resume(); resolve(res.statusCode); }).on("error", reject);
        });
        assert.equal(result, 403);
    } finally {
        restricted.closeAllConnections();
        await new Promise((resolve) => restricted.close(resolve));
    }
});

test("downloads and discards uploads with limits, a single reservation, and a hard request deadline", async () => {
    const token = await issueGrant(key, origin, "https://agent.test");
    const other = await issueGrant(key, origin, "https://agent.test");
    const outcomes = await Promise.all([request("/ping", { token }), request("/ping", { token: other })]);
    assert.deepEqual(outcomes.map(({ status }) => status).sort(), [204, 409]);
    const winner = outcomes[0].status === 204 ? token : other;
    const download = await request("/download?r=0", { token: winner });
    assert.equal(download.status, 200);
    assert.equal(download.bytes, 4 * 1024 * 1024);
    assert.equal(download.headers["cache-control"], "no-store");
    const upload = { method: "POST", token: winner };
    assert.equal((await request("/upload", { ...upload, headers: { "Content-Length": "4" }, body: Buffer.alloc(4) })).status, 204);
    assert.equal((await request("/upload", { ...upload, headers: { "Content-Length": "4194305" } })).status, 413);
    assert.equal((await request("/upload", { ...upload, headers: { "Transfer-Encoding": "chunked" }, body: Buffer.alloc(4) })).status, 411);
    await assert.rejects(new Promise((resolve, reject) => {
        const req = https.request(endpoint + "/upload", {
            ca: cert, method: "POST",
            headers: { Origin: origin, Authorization: `Bearer ${winner}`, "Content-Length": "4" },
        }, resolve);
        req.on("error", reject);
        req.setTimeout(2500, () => req.destroy(new Error("Client fallback timeout")));
        req.write("a");
    }), { code: "ECONNRESET" });
    for (let i = 0; i < 15; i++) assert.equal((await request("/ping", { token: winner })).status, 204);
    assert.equal((await request("/ping", { token: winner })).status, 429);
    for (let i = 1; i < 96; i++) {
        assert.equal((await request("/download", { token: winner })).status, 200);
    }
    const capped = await request("/download", { token: winner });
    assert.equal(capped.status, 429);
    assert.equal(capped.bytes, 0);
});

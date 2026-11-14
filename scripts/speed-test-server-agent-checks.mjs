import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import * as jobs from "../functions/api/speed-test/server/job.js";
import { onRequestPost as agent } from "../functions/api/speed-test/server/agent.js";
import { checkVersion, parseResult, readTarget, runCli } from "../garage/speed-test-server-agent/runner.mjs";
import { processJob } from "../garage/speed-test-server-agent/server.mjs";

const origin = "https://issuedesk.test";
const token = randomBytes(32).toString("hex");
const result = { download: 220, upload: 100, latency: 8, jitter: 1, serverName: "Authorized fixture" };
const migration = readFileSync(new URL("../migrations/0015_speed_test_server_job.sql", import.meta.url), "utf8");

function fixture(t) {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(migration);
    t.after(() => sqlite.close());
    const env = {
        SPEED_TEST_SERVER_ENABLED: "true", SPEED_TEST_SERVER_AGENT_TOKEN: token,
        DB: { prepare: (sql) => ({ bind: (...args) => ({
            first: async () => sql.includes("FROM sessions") ? { id: "owner", role: "admin" } : sqlite.prepare(sql).get(...args) ?? null,
            run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
        }) }) },
    };
    function job(method, { role = "admin", from = origin, search = "", body, id = "owner" } = {}) {
        const request = new Request(`${origin}/api/speed-test/server/job${search}`, {
            method, headers: { Origin: from, ...(role && { Cookie: "issuedesk_session=fixture" }) }, body,
        });
        const db = { prepare: (sql) => sql.includes("FROM sessions")
            ? { bind: () => ({ first: async () => ({ id, role }) }) }
            : env.DB.prepare(sql) };
        return jobs[`onRequest${method[0]}${method.slice(1).toLowerCase()}`]({ request, env: { ...env, DB: db } });
    }
    function command(value, bearer = token) {
        return agent({
            request: new Request(`${origin}/api/speed-test/server/agent`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
                body: JSON.stringify(value),
            }), env,
        });
    }
    async function call(value) {
        const response = await command(value);
        assert.equal(response.status, 200);
        return response.json();
    }
    return { job, command, call, sqlite, env };
}

test("admin and agent boundaries reject browser parameters, outsiders and bogus completions", async (t) => {
    const { job, command, call, env } = fixture(t);
    assert.equal((await job("POST", { role: null })).status, 401);
    assert.equal((await job("GET", { role: "user" })).status, 403);
    assert.equal((await job("DELETE", { from: "https://other.test" })).status, 403);
    assert.equal((await job("POST", { body: "{}" })).status, 400);
    assert.equal((await job("POST", { search: "?server=test" })).status, 400);
    assert.equal((await command({ action: "claim" }, "bad")).status, 401);
    assert.equal((await command({ action: "claim", ignored: "x".repeat(3000) })).status, 400);
    env.SPEED_TEST_SERVER_ENABLED = "false";
    assert.deepEqual(await (await job("GET")).json(), { enabled: false });
    assert.equal((await job("POST")).status, 503);
    env.SPEED_TEST_SERVER_ENABLED = "true";
    assert.equal((await job("POST")).status, 202);
    assert.equal((await (await job("GET", { id: "other" })).json()).job, null);
    const { job: claimed } = await call({ action: "claim" });
    assert.equal((await job("DELETE", { search: `?id=${claimed.id}`, id: "other" })).status, 404);
    assert.equal((await command({ action: "complete", ...claimed, state: "complete", result: {} })).status, 400);
    assert.equal((await command({ action: "complete", ...claimed, state: "complete", result, lease: crypto.randomUUID() })).status, 409);
    await call({ action: "complete", ...claimed, state: "complete", result: { ...result, client: "discard" } });
    assert.deepEqual((await (await job("GET")).json()).job.result, result);
});

test("start and claim are atomic; queued and running cancellation hold correct reservations", async (t) => {
    const { job, call } = fixture(t);
    const starts = await Promise.all(Array.from({ length: 6 }, () => job("POST")));
    assert.deepEqual(starts.map(({ status }) => status).sort(), [202, 409, 409, 409, 409, 409]);
    const claims = await Promise.all(Array.from({ length: 4 }, () => call({ action: "claim" })));
    const active = claims.filter((claim) => claim.job);
    assert.equal(active.length, 1);
    const claimed = active[0].job;
    const cancel = await job("DELETE", { search: `?id=${claimed.id}` });
    assert.equal((await cancel.json()).job.state, "cancelling");
    assert.equal((await job("POST")).status, 409);
    assert.equal((await call({ action: "poll", ...claimed })).stop, true);
    await call({ action: "complete", ...claimed, state: "complete", result });
    const cancelled = (await (await job("GET")).json()).job;
    assert.equal(cancelled.state, "cancelled");
    assert.equal(cancelled.result, null);
    const { job: queued } = await (await job("POST")).json();
    await job("DELETE", { search: `?id=${queued.id}` });
    assert.equal((await call({ action: "claim" })).job, null);
});

test("restarted agent never reruns an abandoned lease or accepts its late result", async (t) => {
    const { job, call, command, sqlite } = fixture(t);
    await job("POST");
    const { job: abandoned } = await call({ action: "claim" });
    assert.equal((await call({ action: "claim" })).job, null);
    assert.equal((await job("POST")).status, 409);
    sqlite.exec("UPDATE speed_test_server_job SET expires_at = 0");
    assert.equal((await (await job("GET")).json()).job.state, "expired");
    await job("POST");
    assert.equal((await command({ action: "complete", ...abandoned, state: "complete", result })).status, 409);
    assert.notEqual((await call({ action: "claim" })).job.id, abandoned.id);
});

test("runner handles cancel, timeout, CLI failure and control loss without fake results", async (t) => {
    for (const [event, expected] of [
        ["cancel", { state: "cancelled" }], ["timeout", { state: "failed", error: "timeout" }],
        ["cli", { state: "failed", error: "cli_failed" }], ["control", { state: "failed", error: "agent_disconnected" }],
    ]) {
        let polls = 0;
        const reports = [];
        await processJob({
            signal: new AbortController().signal, pollInterval: 5, timeout: 30,
            call: async (command) => {
                if (command.action === "claim") return { job: { id: "job", lease: "lease" } };
                if (command.action === "poll") {
                    polls++;
                    if (event === "control" && polls > 1) throw new Error("offline");
                    return { stop: event === "cancel" && polls > 1 };
                }
                reports.push(command);
            },
            run: async (signal) => {
                if (event === "cli") throw new Error("private stderr");
                await delay(1000, undefined, { signal });
            },
        });
        assert.deepEqual(reports, [{ action: "complete", id: "job", lease: "lease", ...expected }]);
    }
    const { job, call } = fixture(t);
    await job("POST");
    const service = new AbortController();
    await processJob({
        call, signal: service.signal, timeout: 1000,
        run: async (signal) => {
            service.abort();
            await delay(500, undefined, { signal });
        },
    });
    assert.equal((await (await job("GET")).json()).job.state, "running");
});

test("strict CLI result schema strips client data and rejects wrong target and zero traffic", () => {
    const target = { name: result.serverName, server: "https://example.test" };
    const row = { download: 220, upload: 100, ping: 8, jitter: 1, bytes_sent: 5, bytes_received: 10,
        server: { name: target.name, url: target.server }, client: { ip: "sensitive" } };
    assert.deepEqual(parseResult(JSON.stringify([row]), target), result);
    assert.throws(() => parseResult(JSON.stringify([{ ...row, bytes_sent: 0 }]), target));
    assert.throws(() => parseResult(JSON.stringify([row]), { ...target, server: "https://other.test" }));
    assert.throws(() => readTarget({ origin: target.server, name: target.name,
        paths: { download: "/../garbage", upload: "/upload", ping: "/empty", ip: "/getIP" } }));
});

test("real pinned LibreSpeed CLI produces all metrics over loopback HTTPS", {
    skip: !process.env.SPEED_TEST_CLI_FIXTURE_BIN,
}, async (t) => {
    const directory = mkdtempSync(join(tmpdir(), "issuedesk-cli-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const cert = join(directory, "cert.pem");
    const key = join(directory, "key.pem");
    execFileSync("openssl", ["req", "-new", "-x509", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=localhost",
        "-addext", "subjectAltName=IP:127.0.0.1", "-days", "1", "-out", cert, "-keyout", key], { stdio: "ignore" });
    const binary = process.env.SPEED_TEST_CLI_FIXTURE_BIN;
    const data = randomBytes(256 * 1024);
    const seen = new Set();
    const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
        const path = req.url.split("?")[0];
        seen.add(path);
        if (path === "/download") return res.end(data);
        if (path === "/upload") {
            req.resume();
            return req.on("end", () => res.end());
        }
        res.end(path === "/getIP" ? "{}" : "");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => { server.closeAllConnections(); server.close(); });
    const target = readTarget({
        origin: `https://127.0.0.1:${server.address().port}`, name: "Loopback CLI fixture",
        paths: { download: "/download", upload: "/upload", ping: "/ping", ip: "/getIP" },
    });
    await checkVersion(binary);
    const { job, call } = fixture(t);
    assert.equal((await job("POST")).status, 202);
    await processJob({
        call, signal: AbortSignal.timeout(25_000),
        run: (signal) => runCli({ binary, target, caPath: cert, signal }),
    });
    const completed = (await (await job("GET")).json()).job;
    assert.equal(completed.state, "complete");
    const measured = completed.result;
    assert.equal(measured.serverName, target.name);
    assert.ok(measured.download > 0 && measured.upload > 0 && measured.latency >= 0 && measured.jitter >= 0);
    assert.deepEqual([...seen].sort(), ["/download", "/getIP", "/ping", "/upload"]);
    const controller = new AbortController();
    const cancelled = runCli({ binary, target, caPath: cert, signal: controller.signal });
    await delay(100);
    controller.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
});

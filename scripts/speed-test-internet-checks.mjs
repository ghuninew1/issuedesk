import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { onRequestPost as grant } from "../functions/api/speed-test/internet/grant.js";
import { onRequestGet as status } from "../functions/api/speed-test/internet/status.js";
import { grantKey, verifyGrant } from "../functions/api/speed-test/_grant.mjs";

const origin = "https://issuedesk.test";
const endpoint = "https://speed-test.example";
const secret = randomBytes(32).toString("hex");
const lanSecret = randomBytes(32).toString("hex");
const migration = readFileSync(new URL("../migrations/0014_speed_test_internet_admissions.sql", import.meta.url), "utf8");

function fixture(t, migrate = true) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    if (migrate) sqlite.exec(migration);

    function context({ method = "POST", role = "admin", id = "admin-1", from = origin, config = {} } = {}) {
        return {
            request: new Request(`${origin}/api/speed-test/internet/${method === "GET" ? "status" : "grant"}`, {
                method, headers: { Origin: from, ...(role && { Cookie: "issuedesk_session=fixture" }) },
            }),
            env: {
                SPEED_TEST_INTERNET_ENABLED: "true",
                SPEED_TEST_INTERNET_ORIGIN: endpoint,
                SPEED_TEST_INTERNET_GRANT_KEY: secret,
                SPEED_TEST_AGENT_ORIGIN: "https://lan.example",
                SPEED_TEST_GRANT_KEY: lanSecret,
                DB: {
                    prepare: (sql) => ({
                        first: async () => sqlite.prepare(sql).get(),
                        bind: (...args) => ({
                            first: async () => ({ role, id }),
                            run: () => ({ meta: { changes: sqlite.prepare(sql).run(...args).changes } }),
                        }),
                    }),
                    batch: async (statements) => {
                        sqlite.exec("BEGIN");
                        try {
                            const result = statements.map((statement) => statement.run());
                            sqlite.exec("COMMIT");
                            return result;
                        } catch (error) {
                            sqlite.exec("ROLLBACK");
                            throw error;
                        }
                    },
                },
                ...config,
            },
        };
    }
    return { context, sqlite };
}

test("readiness and grants require Admin and fail closed on missing configuration", async (t) => {
    const { context } = fixture(t);
    for (const [role, code] of [[null, 401], ["user", 403]]) {
        assert.equal((await status(context({ method: "GET", role }))).status, code);
        assert.equal((await grant(context({ role }))).status, code);
    }
    assert.equal((await grant(context({ from: "https://other.test" }))).status, 403);
    for (const config of [
        { SPEED_TEST_INTERNET_ENABLED: undefined },
        { SPEED_TEST_INTERNET_ORIGIN: "http://speed-test.example" },
        { SPEED_TEST_INTERNET_ORIGIN: "https://speed-test.example/redirect" },
        { SPEED_TEST_INTERNET_ORIGIN: "https://lan.example" },
        { SPEED_TEST_INTERNET_ORIGIN: origin },
        { SPEED_TEST_INTERNET_GRANT_KEY: lanSecret.toUpperCase() },
        { SPEED_TEST_INTERNET_GRANT_KEY: undefined },
    ]) {
        assert.deepEqual(await (await status(context({ method: "GET", config }))).json(), { endpoint: null });
        assert.equal((await grant(context({ config }))).status, 503);
    }
    const ready = await status(context({ method: "GET" }));
    assert.equal(ready.headers.get("cache-control"), "no-store");
    assert.deepEqual(await ready.json(), { endpoint });
    const response = await grant(context());
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.endpoint, endpoint);
    assert.ok(await verifyGrant(await grantKey(secret), body.token, origin, endpoint));
    assert.equal(await verifyGrant(await grantKey(lanSecret), body.token, origin, endpoint), null);
    assert.equal(await verifyGrant(await grantKey(secret), body.token, origin, "https://other.test"), null);
});

test("atomic per-admin cooldown and shared daily ceiling work with real SQLite", async (t) => {
    const { context, sqlite } = fixture(t);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => grant(context())));
    assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 429, 429, 429, 429, 429]);
    sqlite.exec("UPDATE speed_test_internet_admissions SET issued_at = issued_at - 61000");
    assert.equal((await grant(context())).status, 200);
    const other = await Promise.all(Array.from({ length: 12 }, (_, index) => grant(context({ id: `other-${index}` }))));
    assert.equal(other.filter((response) => response.status === 200).length, 8);
    assert.equal(other.filter((response) => response.status === 429).length, 4);
    sqlite.exec("UPDATE speed_test_internet_admissions SET issued_at = issued_at - 86400001");
    assert.equal((await grant(context())).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM speed_test_internet_admissions").get().count, 1);
});

test("missing admissions migration cannot issue a grant", async (t) => {
    const { context } = fixture(t, false);
    assert.equal((await status(context({ method: "GET" }))).status, 503);
    const response = await grant(context());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).token, undefined);
});

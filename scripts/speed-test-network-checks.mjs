import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestGet } from "../functions/api/speed-test/network.js";
import { getInternetNetwork, runInternetTest } from "../src/services/internetSpeedTest.js";

function networkRequest({ role, cf, headers } = {}) {
    const request = new Request("https://issuedesk.test/api/speed-test/network", {
        headers: { ...(role && { Cookie: "issuedesk_session=fixture" }), ...headers },
    });
    if (cf) Object.defineProperty(request, "cf", { value: cf });
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ role }) }) }) } };
    return onRequestGet({ request, env });
}

test("network metadata requires an Admin session and is never cacheable or cross-origin readable", async () => {
    assert.equal((await networkRequest()).status, 401);
    assert.equal((await networkRequest({ role: "user" })).status, 403);
    const response = await networkRequest({
        role: "admin",
        cf: { asOrganization: " Example ISP ", city: "Bangkok", country: "TH", colo: "BKK", latitude: "0" },
        headers: { "CF-Connecting-IP": "2001:db8::2", "X-Forwarded-For": "192.0.2.1", Origin: "https://other.test" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    assert.deepEqual(await response.json(), {
        ip: "2001:db8::2", isp: "Example ISP", city: "Bangkok", country: "TH",
    });
});

test("missing or unknown edge fields stay null, with no forwarded-header fallback", async () => {
    const headers = { "CF-Connecting-IP": "192.0.2.3", "X-Forwarded-For": "192.0.2.4" };
    const unavailable = { ip: null, isp: null, city: null, country: null };
    assert.deepEqual(await (await networkRequest({ role: "admin", headers })).json(), unavailable);
    const request = { role: "admin", cf: { asOrganization: "", city: null, country: "XX" } };
    assert.deepEqual(await (await networkRequest(request)).json(), unavailable);
});

test("trace failure preserves same-origin metadata, and metadata failure preserves the trace code", async (t) => {
    const signal = new AbortController().signal;
    const base = { ip: "192.0.2.42", isp: null, city: null, country: null };
    const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
        if (url === "/api/speed-test/network") return Response.json(base);
        assert.equal(url, "https://speed.cloudflare.com/cdn-cgi/trace");
        assert.equal(options.credentials, "omit");
        return new Response("loc=TH\ncolo=BKK\n");
    });
    assert.deepEqual(await getInternetNetwork(signal), { ...base, colo: "BKK" });
    fetch.mock.mockImplementation(async (url) => url === "/api/speed-test/network"
        ? Response.json(base)
        : new Response("loc=TH\ncolo=unknown\n"));
    assert.deepEqual(await getInternetNetwork(signal), { ...base, colo: null });
    fetch.mock.mockImplementation(async (url) => url === "/api/speed-test/network"
        ? Response.json({ message: "Unavailable" }, { status: 503 })
        : new Response("colo=BKK\n"));
    assert.deepEqual(await getInternetNetwork(signal), { colo: "BKK" });
});

test("cancelling before the engine loads prevents all measurement requests", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch");
    const controller = new AbortController();
    const run = runInternetTest({ signal: controller.signal, onProgress: assert.fail });
    controller.abort();
    await assert.rejects(run, { name: "AbortError" });
    assert.equal(fetch.mock.callCount(), 0);
});

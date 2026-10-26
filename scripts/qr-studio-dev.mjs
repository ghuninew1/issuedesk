// Local-only QR sandbox: real Pages handlers + in-memory SQLite/Storage.
// This script is never imported by the application or production Functions.
import { Readable } from "node:stream";
import { createServer } from "vite";
import { fixture } from "./qr-fixture.mjs";
import { getSessionUser } from "../functions/api/auth/_utils.js";
import * as codes from "../functions/api/qr-codes/index.js";
import * as code from "../functions/api/qr-codes/[id].js";
import * as links from "../functions/api/short-links/index.js";
import * as link from "../functions/api/short-links/[id].js";
import * as check from "../functions/api/short-links/check.js";
import * as logos from "../functions/api/qr-logos/index.js";
import * as logo from "../functions/api/qr-logos/[id].js";
import * as redirect from "../functions/q/[slug].js";

const origin = "http://127.0.0.1:5174";
const storageOrigin = "https://qr-studio-storage.invalid";
const { db, env } = await fixture();
const files = new Map();
Object.assign(env, {
    STORAGE_API_URL: storageOrigin,
    STORAGE_APP_SECRET: "local-qr-sandbox-only",
    CF_ACCESS_CLIENT_ID: "local-qr-sandbox-only",
    CF_ACCESS_CLIENT_SECRET: "local-qr-sandbox-only",
});

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.origin !== storageOrigin) return originalFetch(input, options);
    const match = url.pathname.match(/^\/v2\/projects\/[^/]+\/files(?:\/([a-zA-Z0-9-]+))?$/);
    if (!match) return Response.json({ success: false }, { status: 404 });
    const id = match[1];
    if (options.method === "POST" && !id) {
        const file = options.body.get("file");
        const fileId = crypto.randomUUID();
        files.set(fileId, { bytes: await file.arrayBuffer(), type: file.type });
        return Response.json({ success: true, file: { id: fileId } }, { status: 201 });
    }
    if (options.method === "DELETE") {
        files.delete(id);
        return Response.json({ success: true });
    }
    const file = files.get(id);
    return file
        ? new Response(file.bytes, { headers: { "Content-Type": file.type } })
        : new Response(null, { status: 404 });
};

function resolveRoute(path) {
    if (path === "/api/qr-codes") return { module: codes };
    if (path === "/api/short-links") return { module: links };
    if (path === "/api/short-links/check") return { module: check };
    if (path === "/api/qr-logos") return { module: logos };
    const resource = path.match(/^\/api\/(qr-codes|short-links|qr-logos)\/([^/]+)$/);
    if (resource) return { module: { "qr-codes": code, "short-links": link, "qr-logos": logo }[resource[1]], params: { id: resource[2] } };
    const publicLink = path.match(/^\/q\/([^/]+)$/);
    if (publicLink) return { module: redirect, params: { slug: publicLink[1] } };
    return null;
}

let signedIn = true;
const server = await createServer({
    envDir: false,
    server: { host: "127.0.0.1", port: 5174, strictPort: true, open: "/qr-studio" },
    plugins: [{
        name: "local-qr-studio-sandbox",
        configureServer(vite) {
            vite.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url, origin);
                if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/q/")) return next();
                try {
                    if (req.headers.host !== new URL(origin).host) {
                        res.writeHead(400); res.end("Use the sandbox localhost URL"); return;
                    }
                    const headers = new Headers();
                    for (const [key, value] of Object.entries(req.headers)) {
                        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
                    }
                    // Simulate a session only inside this explicit local test process.
                    headers.set("Cookie", signedIn ? "issuedesk_session=alice" : "");
                    const method = req.method || "GET";
                    const request = new Request(url, {
                        method, headers,
                        ...(!["GET", "HEAD"].includes(method) ? { body: Readable.toWeb(req), duplex: "half" } : {}),
                    });
                    let response;
                    if (url.pathname === "/api/auth/me" && method === "GET") {
                        const user = await getSessionUser(request, env);
                        response = Response.json({ success: true, user });
                    } else if (url.pathname === "/api/auth/logout" && method === "POST" && headers.get("Origin") === origin) {
                        signedIn = false;
                        response = Response.json({ success: true });
                    } else {
                        const route = resolveRoute(url.pathname);
                        const handler = route?.module[`onRequest${method[0]}${method.slice(1).toLowerCase()}`];
                        response = handler
                            ? await handler({ env, request, params: route.params || {} })
                            : Response.json({ success: false, error: { code: "SANDBOX_UNSUPPORTED", message: "This sandbox supports QR Studio APIs only. Restart dev:qr after signing out." } }, { status: 404 });
                    }
                    res.writeHead(response.status, { ...Object.fromEntries(response.headers), "Cache-Control": "no-store" });
                    res.end(Buffer.from(await response.arrayBuffer()));
                } catch (error) {
                    console.error("QR sandbox request failed:", error);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ success: false, error: { code: "SANDBOX_ERROR", message: "Local sandbox request failed" } }));
                }
            });
        },
    }],
});
await server.listen();
console.log(`\nQR Studio sandbox: ${origin}/qr-studio\nMock user: alice@example.com (ordinary user)\nSQLite and logo uploads exist in memory only; restarting clears all test data.\nProduction auth, databases and Garage are unchanged. Ctrl+C to stop.\n`);
let closing = false;
async function close() {
    if (closing) return;
    closing = true;
    await server.close();
    globalThis.fetch = originalFetch;
    db.close();
    process.exit(0);
}
process.once("SIGINT", close);
process.once("SIGTERM", close);

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { BlockList, isIPv4 } from "node:net";
import { pathToFileURL } from "node:url";
import { grantKey, httpsOrigin, verifyGrant } from "../../functions/api/speed-test/_grant.mjs";

const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_DIRECTION_BYTES = 384 * 1024 * 1024;
const MAX_PINGS = 16;
const REQUEST_TIMEOUT_MS = 6_000;
const privateAddresses = new BlockList();
privateAddresses.addSubnet("10.0.0.0", 8);
privateAddresses.addSubnet("172.16.0.0", 12);
privateAddresses.addSubnet("192.168.0.0", 16);
privateAddresses.addSubnet("127.0.0.0", 8);

export async function createAgent({
    host, clientSubnet, origin, audience, secret, tls,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
}) {
    const [network, prefix, extra] = (clientSubnet ?? "").split("/");
    const allowedClients = new BlockList();
    const key = await grantKey(secret);
    if (!key || !httpsOrigin(origin) || !httpsOrigin(audience) ||
        !isIPv4(host) || !privateAddresses.check(host) ||
        !isIPv4(network) || !privateAddresses.check(network) ||
        !/^(?:[89]|[12][0-9]|3[0-2])$/.test(prefix ?? "") || extra !== undefined) {
        throw new Error("Configure HTTPS origins, a private IPv4 bind address and client CIDR, and a 32-byte grant key");
    }
    allowedClients.addSubnet(network, Number(prefix));
    const download = randomBytes(CHUNK_BYTES);
    const methods = new Map([["/ping", "GET"], ["/download", "GET"], ["/upload", "POST"]]);
    let activeGrant = null;
    let transfers = 0;

    function handleRequest(request, response) {
        const finish = (status, headers) => {
            response.writeHead(status, headers);
            response.end();
        };
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Vary", "Origin");
        // Bound header-to-finish time, including slow readers/writers.
        const deadline = setTimeout(() => response.destroy(), requestTimeoutMs);
        response.once("close", () => clearTimeout(deadline));

        const peer = request.socket.remoteAddress;
        if (!peer || !privateAddresses.check(peer) || !allowedClients.check(peer)) return finish(403, { Connection: "close" });
        if (request.headers.origin !== origin) return finish(403, { Connection: "close" });
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Timing-Allow-Origin", origin);

        const path = request.url.split("?")[0];
        const method = methods.get(path);
        if (!method) return finish(404, { Connection: "close" });
        if (request.method === "OPTIONS") {
            const headers = (request.headers["access-control-request-headers"] ?? "").toLowerCase().split(",").map((item) => item.trim());
            if (request.headers["access-control-request-method"] !== method ||
                headers.some((item) => item && !["authorization", "content-encoding", "content-type"].includes(item))) {
                return finish(403, { Connection: "close" });
            }
            // Older Chromium PNA preflights may request this on an explicitly allowed origin.
            if (request.headers["access-control-request-private-network"] === "true") {
                response.setHeader("Access-Control-Allow-Private-Network", "true");
            }
            return finish(204, {
                "Access-Control-Allow-Methods": method,
                "Access-Control-Allow-Headers": "Authorization, Content-Encoding, Content-Type",
                "Access-Control-Max-Age": "60",
            });
        }
        if (request.method !== method) return finish(405, { Connection: "close", Allow: method });

        const token = request.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
        verifyGrant(key, token, origin, audience).then((grant) => {
            if (response.destroyed) return;
            if (!grant) return finish(401, { Connection: "close" });
            const length = Number(request.headers["content-length"] ?? 0);
            const chunked = request.headers["transfer-encoding"] !== undefined;
            if (path === "/upload") {
                const encoding = request.headers["content-encoding"];
                if (encoding && encoding !== "identity") return finish(415, { Connection: "close" });
                if (length > CHUNK_BYTES) return finish(413, { Connection: "close" });
                if (chunked || !Number.isInteger(length) || length < 1) return finish(411, { Connection: "close" });
            } else if (length || chunked) {
                return finish(400, { Connection: "close" });
            }

            if (!activeGrant || (activeGrant.expiresAt <= Date.now() && transfers === 0)) {
                activeGrant = { ...grant, peer, pings: 0, uploaded: 0, downloaded: 0 };
            }
            if (activeGrant.id !== grant.id || activeGrant.peer !== peer) return finish(409, { Connection: "close" });
            if (path === "/ping") {
                if (activeGrant.pings >= MAX_PINGS) return finish(429);
                activeGrant.pings++;
                return finish(204);
            }
            if (transfers >= 3) return finish(429, { Connection: "close" });
            const direction = path === "/download" ? "downloaded" : "uploaded";
            const bytes = direction === "downloaded" ? download.length : length;
            if (activeGrant[direction] + bytes > MAX_DIRECTION_BYTES) return finish(429, { Connection: "close" });
            // Reserve the full request size even if it gets interrupted.
            activeGrant[direction] += bytes;
            transfers++;
            const expiry = setTimeout(() => response.destroy(), Math.max(0, grant.expiresAt - Date.now()));
            response.once("close", () => {
                clearTimeout(expiry);
                transfers--;
            });

            if (path === "/download") {
                response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": bytes });
                return response.end(download);
            }
            request.on("error", () => response.destroy());
            request.on("end", () => finish(204));
            request.resume();
        }).catch(() => {
            if (!response.destroyed && !response.headersSent) finish(500, { Connection: "close" });
            else response.destroy();
        });
    }

    const server = createServer({
        ...tls, minVersion: "TLSv1.2", maxHeaderSize: 4096, headersTimeout: Math.min(5_000, requestTimeoutMs),
        requestTimeout: requestTimeoutMs, connectionsCheckingInterval: 1000,
        keepAliveTimeout: 2000, handshakeTimeout: 5000,
    }, handleRequest);
    server.maxConnections = 16;
    server.on("checkContinue", (_request, response) => {
        response.writeHead(417, { Connection: "close" }).end();
    });
    return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const env = process.env;
    const host = env.SPEED_TEST_BIND ?? "127.0.0.1";
    const port = Number(env.SPEED_TEST_PORT ?? 8443);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid Agent port");
    const server = await createAgent({
        host,
        clientSubnet: env.SPEED_TEST_CLIENT_CIDR ?? "127.0.0.1/32",
        origin: env.SPEED_TEST_ISSUEDESK_ORIGIN,
        audience: env.SPEED_TEST_AGENT_ORIGIN,
        secret: env.SPEED_TEST_GRANT_KEY,
        tls: {
            cert: readFileSync(env.SPEED_TEST_TLS_CERT),
            key: readFileSync(env.SPEED_TEST_TLS_KEY),
        },
    });
    server.listen(port, host, () => console.log(`LAN Speed Test Agent listening on ${host}:${port}`));
}

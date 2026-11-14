import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { createPublicAgent } from "../speed-test-agent/server.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const env = process.env;
    const host = env.SPEED_TEST_INTERNET_BIND ?? "127.0.0.1";
    const port = Number(env.SPEED_TEST_INTERNET_PORT ?? 8443);
    if (!isIP(host) || !Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new Error("Configure a listen IP and port between 1024 and 65535");
    }
    const server = await createPublicAgent({
        origin: env.SPEED_TEST_INTERNET_ISSUEDESK_ORIGIN,
        audience: env.SPEED_TEST_INTERNET_ORIGIN,
        secret: env.SPEED_TEST_INTERNET_GRANT_KEY,
        tls: {
            cert: readFileSync(env.SPEED_TEST_INTERNET_TLS_CERT),
            key: readFileSync(env.SPEED_TEST_INTERNET_TLS_KEY),
        },
    });
    server.listen(port, host, () => console.log(`Public Speed Test Agent listening on ${host}:${port}`));
}

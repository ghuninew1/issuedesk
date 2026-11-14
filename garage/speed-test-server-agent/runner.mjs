import { spawn } from "node:child_process";

export const CLI_VERSION = "1.0.14";
const maxOutput = 32 * 1024;

function execute(binary, args, { input, signal, env }) {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"], env, shell: false });
        let output = "";
        let size = 0;
        let failure;
        let escalation;
        function stop(reason) {
            if (failure) return;
            failure = reason;
            child.kill("SIGTERM");
            escalation = setTimeout(() => child.kill("SIGKILL"), 750);
        }
        const abort = () => stop(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            size += Buffer.byteLength(chunk);
            if (size > maxOutput) stop(new Error("cli_failed"));
            else output += chunk;
        });
        child.stderr.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxOutput) stop(new Error("cli_failed"));
        });
        child.stdin.on("error", () => {});
        child.on("error", () => stop(new Error("cli_failed")));
        child.once("close", (code) => {
            clearTimeout(escalation);
            signal.removeEventListener("abort", abort);
            if (failure || code !== 0) reject(failure ?? new Error("cli_failed"));
            else resolve(output);
        });
        child.stdin.end(input);
    });
}

export async function checkVersion(binary) {
    const result = await execute(binary, ["--version"], { signal: AbortSignal.timeout(3000), env: { LANG: "C" } });
    if (!result.startsWith(`librespeed-cli v${CLI_VERSION} (`)) throw new Error("Unsupported LibreSpeed CLI version");
}

export function readTarget({ origin, name, paths }) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin || !name?.trim() ||
        name.length > 100 || /\p{Cc}/u.test(name)) throw new Error("Invalid approved target");
    const { download, upload, ping, ip } = paths;
    for (const path of [download, upload, ping, ip]) {
        if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(path ?? "") || /\/\.{1,2}$/.test(path)) {
            throw new Error("Invalid approved endpoint path");
        }
    }
    return { id: 1, name, server: origin, dlURL: download, ulURL: upload, pingURL: ping, getIpURL: ip };
}

export function parseResult(output, target) {
    const rows = JSON.parse(output);
    if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Invalid result count");
    const { download, upload, ping: latency, jitter, server, bytes_sent, bytes_received } = rows[0];
    if (server?.name !== target.name || server.url !== target.server ||
        !Number.isFinite(download) || download <= 0 || !Number.isFinite(upload) || upload <= 0 ||
        !Number.isFinite(latency) || latency < 0 || !Number.isFinite(jitter) || jitter < 0 ||
        !Number.isSafeInteger(bytes_sent) || bytes_sent <= 0 || !Number.isSafeInteger(bytes_received) || bytes_received <= 0) {
        throw new Error("Invalid CLI measurement");
    }
    return { download, upload, latency, jitter, serverName: server.name };
}

export async function runCli({ binary, target, signal, caPath }) {
    const args = [
        "--local-json", "-", "--server", "1", "--json", "--secure", "--no-icmp",
        "--concurrent", "1", "--duration", "3", "--timeout", "5", "--chunks", "4", "--upload-size", "1024",
        "--no-pre-allocate",
    ];
    // Sharing and telemetry default off. The CLI gets no proxy settings or agent credentials.
    if (caPath) args.push("--ca-cert", caPath);
    const output = await execute(binary, args, { input: JSON.stringify([target]), signal, env: { LANG: "C", GOMAXPROCS: "2", GOMEMLIMIT: "128MiB" } });
    try {
        return parseResult(output, target);
    } catch {
        throw new Error("invalid_result");
    }
}

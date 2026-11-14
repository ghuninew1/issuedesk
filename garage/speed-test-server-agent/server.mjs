import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { checkVersion, readTarget, runCli } from "./runner.mjs";

const pollMs = 2000;
const executionMs = 40_000;

function agentClient(origin, token, access) {
    return async (command, signal) => {
        const response = await fetch(`${origin}/api/speed-test/server/agent`, {
            method: "POST",
            redirect: "error",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...access },
            body: JSON.stringify(command),
            signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
        });
        if (response.status === 409 && command.action === "complete") return;
        if (!response.ok) throw new Error("Control request failed");
        return response.json();
    };
}

export async function processJob({ call, run, signal, pollInterval = pollMs, timeout = executionMs }) {
    // Start the local clock before claiming. Even a slow claim cannot extend the
    // runner past the API's 60-second reservation.
    const deadline = AbortSignal.timeout(timeout);
    const { job } = await call({ action: "claim" }, AbortSignal.any([signal, deadline]));
    if (!job) return;
    const stop = new AbortController();
    const execution = AbortSignal.any([signal, deadline, stop.signal]);
    const identity = { id: job.id, lease: job.lease };
    let remoteCancelled = false;
    // Confirm the lease before starting a child, including a cancel racing claim.
    const initial = await call({ action: "poll", ...identity }, execution);
    if (initial.stop) {
        await call({ action: "complete", ...identity, state: "cancelled" }, signal);
        return;
    }
    const watcher = (async () => {
        try {
            while (!execution.aborted) {
                await delay(pollInterval, undefined, { signal: execution });
                const { stop: shouldStop } = await call({ action: "poll", ...identity }, execution);
                if (shouldStop) {
                    remoteCancelled = true;
                    stop.abort();
                    return;
                }
            }
        } catch {
            if (!execution.aborted) stop.abort();
        }
    })();
    let outcome;
    try {
        const result = await run(execution);
        execution.throwIfAborted();
        outcome = { state: "complete", result };
    } catch (error) {
        outcome = remoteCancelled ? { state: "cancelled" }
            : { state: "failed", error: deadline.aborted ? "timeout"
                : stop.signal.aborted ? "agent_disconnected"
                : error.message === "invalid_result" ? "invalid_result" : "cli_failed" };
    } finally {
        stop.abort();
        await watcher;
    }
    if (!signal.aborted) await call({ action: "complete", ...identity, ...outcome }, signal);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const env = process.env;
    const origin = env.SPEED_TEST_SERVER_ISSUEDESK_ORIGIN;
    const token = env.SPEED_TEST_SERVER_AGENT_TOKEN;
    if (env.SPEED_TEST_SERVER_TARGET_APPROVED !== "true" || !origin || new URL(origin).origin !== origin ||
        !origin.startsWith("https://") || !/^[a-f0-9]{64}$/i.test(token ?? "")) {
        throw new Error("Configure an approved HTTPS target, IssueDesk HTTPS origin and agent token");
    }
    const target = readTarget({
        origin: env.SPEED_TEST_SERVER_TARGET_ORIGIN, name: env.SPEED_TEST_SERVER_TARGET_NAME,
        paths: {
            download: env.SPEED_TEST_SERVER_DOWNLOAD_PATH, upload: env.SPEED_TEST_SERVER_UPLOAD_PATH,
            ping: env.SPEED_TEST_SERVER_PING_PATH, ip: env.SPEED_TEST_SERVER_IP_PATH,
        },
    });
    const binary = env.SPEED_TEST_SERVER_CLI ?? "/usr/local/bin/librespeed-cli";
    if (!binary.startsWith("/")) throw new Error("Configure an absolute CLI path");
    await checkVersion(binary);
    const access = {};
    if (env.SPEED_TEST_SERVER_ACCESS_CLIENT_ID && env.SPEED_TEST_SERVER_ACCESS_CLIENT_SECRET) {
        access["CF-Access-Client-Id"] = env.SPEED_TEST_SERVER_ACCESS_CLIENT_ID;
        access["CF-Access-Client-Secret"] = env.SPEED_TEST_SERVER_ACCESS_CLIENT_SECRET;
    }
    const call = agentClient(origin, token, access);
    const lifetime = new AbortController();
    process.once("SIGTERM", () => lifetime.abort());
    process.once("SIGINT", () => lifetime.abort());
    while (!lifetime.signal.aborted) {
        try {
            await processJob({ call, signal: lifetime.signal, run: (signal) => runCli({ binary, target, signal }) });
        } catch {
            if (!lifetime.signal.aborted) console.error("Server Speed Test control request failed");
        }
        await delay(pollMs, undefined, { signal: lifetime.signal }).catch(() => {});
    }
}

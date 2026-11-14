import { api } from "../utils/api";

const stages = ["Preparing…", "Measuring download…", "Measuring latency and jitter…", "Measuring upload…"];
const timeoutMs = 18_000;

function measure(endpoint, token, signal, onStage) {
    return new Promise((resolve, reject) => {
        const worker = new Worker("/vendor/librespeed/speedtest_worker.js");
        function finish(error, result) {
            worker.terminate();
            clearInterval(poll);
            signal.removeEventListener("abort", abort);
            if (error) reject(error);
            else resolve(result);
        }
        function abort() {
            finish(signal.reason);
        }
        const poll = setInterval(() => worker.postMessage("status"), 250);
        signal.addEventListener("abort", abort, { once: true });
        worker.onerror = () => finish(new Error("The measurement worker could not run"));
        let lastStage;
        worker.onmessage = ({ data }) => {
            const status = JSON.parse(data);
            if (status.measurementLimitReached) {
                return finish(new Error("The test reached the pilot traffic limit. No result was recorded."));
            }
            if (status.testState === 4) {
                const values = [status.dlStatus, status.ulStatus, status.pingStatus, status.jitterStatus];
                if (values.some((value) => value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) ||
                    Number(values[0]) === 0 || Number(values[1]) === 0) {
                    return finish(new Error("No valid measurement. Check the LAN connection and wait for any previous test to expire."));
                }
                const [download, upload, latency, jitter] = values.map(Number);
                return finish(null, { download, upload, latency, jitter });
            }
            const stage = stages[status.testState];
            if (stage && stage !== lastStage) {
                lastStage = stage;
                onStage(stage);
            }
        };
        worker.postMessage(`start ${JSON.stringify({
            measurementToken: token,
            test_order: "PDU",
            url_ping: `${endpoint}/ping`,
            url_dl: `${endpoint}/download`,
            url_ul: `${endpoint}/upload`,
            telemetry_level: "disabled",
            enable_quirks: false,
            xhr_ignoreErrors: 0,
            xhr_dlUseBlob: false,
            xhr_dlMultistream: 1,
            xhr_ulMultistream: 1,
            xhr_ul_blob_megabytes: 4,
            time_auto: false,
            time_dl_max: 2,
            time_ul_max: 2,
            time_dlGraceTime: 0.4,
            time_ulGraceTime: 0.4,
            overheadCompensationFactor: 1,
        })}`);
    });
}

export async function runLanTest({ signal, onEndpoint, onStage }) {
    if (!window.isSecureContext) throw new Error("Open IssueDesk over HTTPS to run a LAN test.");
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    try {
        const { endpoint, token } = await api("/api/speed-test/grant", { method: "POST", signal: deadline });
        onEndpoint(endpoint);
        // Request LAN access from the document before the worker uses the connection.
        let probe;
        try {
            probe = await fetch(`${endpoint}/ping`, {
                headers: { Authorization: `Bearer ${token}` },
                credentials: "omit", cache: "no-store", redirect: "error", signal: deadline,
            });
        } catch (error) {
            if (deadline.aborted) throw error;
            throw new Error("Cannot reach the LAN agent. Check local network permission, DNS, TLS and CORS.", { cause: error });
        }
        if (probe.status === 409) throw new Error("A LAN test is already reserved. Wait up to 45 seconds and retry.");
        if (!probe.ok) throw new Error(`The LAN agent refused the test (HTTP ${probe.status}).`);
        deadline.throwIfAborted();
        return await measure(endpoint, token, deadline, onStage);
    } catch (error) {
        if (deadline.reason?.name === "TimeoutError") throw new Error("The LAN test timed out.", { cause: error });
        throw error;
    }
}

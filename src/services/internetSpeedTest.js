import { api } from "../utils/api.js";

const origin = "https://speed.cloudflare.com";
const measurementPhases = {
    latency: "Measuring latency and jitter…",
    download: "Measuring download…",
    upload: "Measuring upload…",
};
const bandwidthMeasurements = [1e5, 1e6, 1e7].map((bytes) => ({ bytes, count: 3 }));

function normalizeResults(results) {
    const download = results.getDownloadBandwidth();
    const upload = results.getUploadBandwidth();
    const latency = results.getUnloadedLatency();
    const jitter = results.getUnloadedJitter();
    return {
        download: Number.isFinite(download) && download > 0 ? download / 1e6 : null,
        upload: Number.isFinite(upload) && upload > 0 ? upload / 1e6 : null,
        latency: results.getUnloadedLatencyPoints().length && Number.isFinite(latency) && latency >= 0 ? latency : null,
        jitter: Number.isFinite(jitter) && jitter >= 0 ? jitter : null,
    };
}

export async function runInternetTest({ signal, onProgress }) {
    const { default: SpeedTest } = await import("@cloudflare/speedtest");
    signal.throwIfAborted();

    const engine = new SpeedTest({
        autoStart: false,
        measurementTargets: [origin],
        includeCredentials: false,
        logAimApiUrl: null,
        logMeasurementApiUrl: null,
        measureDownloadLoadedLatency: false,
        measureUploadLoadedLatency: false,
        abortRequestDuration: 8_000,
        measurements: [
            { type: "latency", numPackets: 20 },
            ...bandwidthMeasurements.map((measurement) => ({ type: "download", ...measurement })),
            ...bandwidthMeasurements.map((measurement) => ({ type: "upload", ...measurement })),
        ],
    });

    return new Promise((resolve, reject) => {
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
        function finish(error, result) {
            deadline.removeEventListener("abort", abort);
            engine.onResultsChange = engine.onError = engine.onFinish = () => {};
            engine.pause();
            if (error) reject(error);
            else resolve(result);
        }
        function abort() {
            finish(signal.aborted ? signal.reason : new Error("The Internet test timed out."));
        }
        deadline.addEventListener("abort", abort, { once: true });
        engine.onResultsChange = ({ type }) => {
            onProgress(measurementPhases[type], normalizeResults(engine.results));
        };
        engine.onError = (_message, status) => {
            finish(new Error(status === 429
                ? "Cloudflare is rate limiting tests. Wait and try again."
                : "Cloudflare could not complete the measurement. Check your connection and try again."));
        };
        engine.onFinish = (results) => {
            const result = normalizeResults(results);
            if (Object.values(result).includes(null)) {
                finish(new Error("Cloudflare returned an incomplete measurement. Please try again."));
            } else {
                finish(null, result);
            }
        };
        try {
            engine.play();
        } catch (error) {
            finish(error);
        }
    });
}

async function getCloudflareLocation(signal) {
    const response = await fetch(`${origin}/cdn-cgi/trace`, {
        cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal,
    });
    if (!response.ok) return null;
    return (await response.text()).match(/^colo=([A-Z]{3})\r?$/m)?.[1] ?? null;
}

export async function getInternetNetwork(signal) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(5_000)]);
    const [network, location] = await Promise.allSettled([
        api("/api/speed-test/network", { signal: deadline }),
        getCloudflareLocation(deadline),
    ]);
    return {
        ...(network.status === "fulfilled" && network.value),
        colo: location.status === "fulfilled" ? location.value : null,
    };
}

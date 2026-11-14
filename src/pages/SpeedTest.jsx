import { useEffect, useRef, useState } from "react";
import GlassButton from "../components/GlassButton";
import { runLanTest } from "../services/lanSpeedTest";
import { cx } from "../utils/cx";

const metrics = [
    ["Download", "download", "Mbps"],
    ["Upload", "upload", "Mbps"],
    ["HTTP latency", "latency", "ms"],
    ["Jitter", "jitter", "ms"],
];

export default function SpeedTest() {
    const active = useRef(null);
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState("Ready");
    const [endpoint, setEndpoint] = useState(null);
    const [result, setResult] = useState(null);

    useEffect(() => () => active.current?.abort(), []);

    async function start() {
        if (active.current) return;
        const controller = new AbortController();
        active.current = controller;
        setRunning(true);
        setStatus("Connecting to the LAN agent…");
        setResult(null);
        setEndpoint(null);
        try {
            const measured = await runLanTest({
                signal: controller.signal,
                onEndpoint: setEndpoint,
                onStage: setStatus,
            });
            if (!controller.signal.aborted) {
                setResult(measured);
                setStatus("Test complete");
            }
        } catch (error) {
            if (!controller.signal.aborted) setStatus(error.message);
        } finally {
            if (!controller.signal.aborted) {
                active.current = null;
                setRunning(false);
            }
        }
    }

    function cancel() {
        active.current?.abort();
        active.current = null;
        setRunning(false);
        setStatus("Test cancelled");
    }

    return (
        <section className={cx("mx-auto max-w-3xl rounded-2xl border border-border bg-card p-4 sm:p-6")}>
            <h2 className={cx("text-xl font-semibold tracking-tight")}>LAN Speed Test</h2>
            <p className={cx("mt-2 text-sm text-muted-foreground")}>
                Measure the connection between this browser and the Ubuntu agent on your local network.
            </p>
            {endpoint && <p className={cx("mt-2 break-all text-sm text-muted-foreground")}>{endpoint}</p>}
            <dl className={cx("my-5 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2")}>
                {metrics.map(([label, key, unit]) => (
                    <div key={key} className={cx("rounded-xl border border-border bg-background p-4")}>
                        <dt className={cx("text-sm text-muted-foreground")}>{label}</dt>
                        <dd className={cx("mt-1 font-semibold tabular-nums")}>
                            {result ? `${result[key]} ${unit}` : "—"}
                        </dd>
                    </div>
                ))}
            </dl>
            <div className={cx("flex flex-wrap items-center gap-2")}>
                <GlassButton type="button" className={cx("rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60")} onClick={start} disabled={running}>
                    Start LAN test
                </GlassButton>
                {running && (
                    <GlassButton type="button" className={cx("rounded-lg border border-border px-4 py-2")} onClick={cancel}>
                        Cancel
                    </GlassButton>
                )}
            </div>
            <p role="status" className={cx("mt-3 text-sm text-muted-foreground")}>{status}</p>
        </section>
    );
}

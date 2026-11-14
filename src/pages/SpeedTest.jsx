import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Check, CircleAlert, Gauge, Globe, Server, Timer } from "lucide-react";
import GlassButton from "../components/GlassButton";
import { runLanTest } from "../services/lanSpeedTest";
import { api } from "../utils/api";
import { useAuth } from "../auth/useAuth";
import { cx } from "../utils/cx";

const tabs = [
    { id: "server", label: "Server Test", icon: Server },
    { id: "server-internet", label: "Server Internet Test", icon: Server },
    { id: "internet", label: "Client Internet Test", icon: Globe },
];

const metrics = [
    { key: "download", label: "Download", unit: "Mbps", icon: ArrowDown },
    { key: "upload", label: "Upload", unit: "Mbps", icon: ArrowUp },
    { key: "latency", label: "HTTP Latency", unit: "ms", icon: Timer },
    { key: "jitter", label: "Jitter", unit: "ms", icon: Activity },
];

const stages = [
    { label: "Connect", message: "Connecting to the LAN agent…" },
    { label: "Latency & jitter", message: "Measuring latency and jitter…" },
    { label: "Download", message: "Measuring download…" },
    { label: "Upload", message: "Measuring upload…" },
];

const gaugeArc = "M 42 137 A 118 118 0 0 1 278 137";
const gaugeTicks = Array.from({ length: 21 }, (_, index) => index);
const formatMetric = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function DownloadGauge({ value, running }) {
    const hasResult = value != null;
    const scale = Math.max(1000, Math.ceil((value ?? 0) / 1000) * 1000);
    const fraction = hasResult ? value / scale : 0;

    return (
        <div className={cx("mx-auto w-full max-w-sm")}>
            <div className={cx("relative")}>
                <svg viewBox="0 0 320 154" className={cx("block w-full overflow-visible")} aria-hidden="true">
                    <path d={gaugeArc} fill="none" strokeWidth="12" strokeLinecap="round" className={cx("stroke-muted")} />
                    {hasResult && fraction > 0 && (
                        <path d={gaugeArc} pathLength="100" strokeDasharray={`${fraction * 100} 100`} fill="none" strokeWidth="12" strokeLinecap="round" className={cx("stroke-primary")} />
                    )}
                    <g className={cx("stroke-muted-foreground/50")} strokeLinecap="round">
                        {gaugeTicks.map((tick) => (
                            <line key={tick} x1="160" y1={tick % 5 === 0 ? 5 : 9} x2="160" y2="11" transform={`rotate(${tick * 9 - 90} 160 137)`} />
                        ))}
                    </g>
                    {hasResult && (
                        <circle cx="160" cy="19" r="5" transform={`rotate(${fraction * 180 - 90} 160 137)`} className={cx("fill-primary stroke-card")} strokeWidth="2" />
                    )}
                    <g className={cx("fill-muted-foreground")} fontSize="11" textAnchor="middle">
                        <text x="42" y="154">0</text>
                        <text x="278" y="154">{formatMetric.format(scale)}</text>
                    </g>
                </svg>
                <div className={cx("pointer-events-none absolute inset-x-0 top-[43%] flex flex-col items-center")}>
                    <span className={cx("text-xs font-medium text-muted-foreground")}>Download speed</span>
                    <span className={cx("mt-1 text-4xl leading-none font-semibold tracking-tight tabular-nums sm:text-5xl")} data-testid="download-gauge">
                        {hasResult ? formatMetric.format(value) : "—"}
                    </span>
                    <span className={cx("mt-1 text-xs text-muted-foreground sm:text-sm")}>Mbps</span>
                </div>
            </div>
            {running && (
                <p className={cx("mt-2 text-center text-xs text-muted-foreground")}>Download speed appears when the test finishes.</p>
            )}
        </div>
    );
}

function TestProgress({ currentStage, completed }) {
    return (
        <ol aria-label="Test progress" className={cx("grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4")}>
            {stages.map(({ label }, index) => {
                const done = completed || index < currentStage;
                const current = index === currentStage && !completed;
                return (
                    <li key={label} aria-current={current ? "step" : undefined} className={cx("min-w-0")}>
                        <div className={cx("mb-2 h-1 rounded-full", done ? "bg-primary" : current ? "bg-primary/50 motion-safe:animate-pulse" : "bg-border")} />
                        <span className={cx("flex items-center gap-1 text-xs", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                            {done && <Check size={12} className={cx("shrink-0 text-primary")} aria-label="Completed" />}
                            {label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

const initialTest = { phase: "idle", stage: -1, endpoint: null, result: null, error: null };

function TestDashboard({ test, internet = false, pendingAction = false, start, cancel }) {
    const { phase, stage, endpoint, result, error } = test;
    const TargetIcon = internet ? Globe : Server;
    const running = ["queued", "running", "cancelling"].includes(phase);
    const completed = phase === "complete";
    const status = phase === "queued" ? "Waiting for the Ubuntu agent…"
        : phase === "cancelling" ? "Stopping the Ubuntu test…"
        : running && internet ? "Ubuntu is running LibreSpeed CLI…"
        : running ? stages[stage].message
        : completed ? "Test complete"
        : phase === "cancelled" ? "Test cancelled"
        : "Ready to test";
    const connection = completed || (running && stage > 0) ? "Connected"
        : running ? "Connecting"
        : phase === "error" ? "Test failed"
        : "Not testing";

    return (
        <div className={cx("overflow-hidden rounded-2xl border border-border bg-card shadow-sm")}>
            <div className={cx("flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6")}>
                <div className={cx("flex min-w-0 items-center gap-3")}>
                    <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-muted text-primary")}>
                        <TargetIcon size={19} aria-hidden="true" />
                    </span>
                    <div className={cx("min-w-0")}>
                        <p className={cx("text-xs font-medium text-muted-foreground")}>{internet ? "Internet target" : "Server target"}</p>
                        <h2 className={cx("font-semibold tracking-tight")}>{internet ? "Ubuntu Server → Internet" : "Ubuntu LAN Agent"}</h2>
                        {internet && result?.serverName && <p className={cx("mt-0.5 text-xs break-all text-muted-foreground")}>Test server · {result.serverName}</p>}
                        {endpoint && <p className={cx("mt-0.5 text-xs break-all text-muted-foreground")}>{endpoint}</p>}
                    </div>
                </div>
                <span className={cx("inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium",
                    phase === "error" ? "text-destructive" : "text-muted-foreground")}>
                    <span aria-hidden="true" className={cx("size-1.5 rounded-full", connection === "Connected" ? "bg-primary" : "bg-current", connection === "Connecting" && "motion-safe:animate-pulse")} />
                    <span className={cx("sr-only")}>Connection status: </span>{connection}
                </span>
            </div>

            <div className={cx("grid items-center gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-8 lg:py-8")}>
                <DownloadGauge value={result?.download} running={running} />
                <dl className={cx("grid grid-cols-2 gap-2 sm:gap-3")}>
                    {metrics.map(({ key, label, unit, icon: Icon }) => (
                        <div key={key} className={cx("min-w-0 rounded-xl border border-border bg-background p-3 sm:p-4")}>
                            <dt className={cx("flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm")}>
                                <Icon size={15} className={cx("shrink-0 text-primary")} aria-hidden="true" />
                                {label}
                            </dt>
                            <dd className={cx("mt-2 flex flex-wrap items-baseline gap-x-1.5")}>
                                <span className={cx("text-2xl leading-none font-semibold tracking-tight tabular-nums")}>{result ? formatMetric.format(result[key]) : "—"}</span>
                                <span className={cx("text-xs text-muted-foreground")}>{unit}</span>
                            </dd>
                        </div>
                    ))}
                </dl>
            </div>

            <div className={cx("space-y-4 border-t border-border px-4 py-4 sm:px-6")}>
                {!internet && <TestProgress currentStage={running ? stage : -1} completed={completed} />}
                {error && (
                    <div role="alert" className={cx("flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive")}>
                        <CircleAlert size={18} className={cx("mt-0.5 shrink-0")} aria-hidden="true" />
                        <div>
                            <p className={cx("font-semibold")}>{internet ? "Internet test failed" : "LAN test failed"}</p>
                            <p>{error}</p>
                        </div>
                    </div>
                )}
                <div className={cx("flex flex-wrap items-center justify-between gap-3")}>
                    <p role="status" className={cx("text-sm text-muted-foreground")}>{error ? "" : status}</p>
                    <GlassButton type="button" disabled={pendingAction || phase === "cancelling"} onClick={running ? cancel : start}
                        className={cx("inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50",
                            running ? "border-border bg-background" : "border-primary/45 bg-primary/10 text-primary")}>
                        {!running && <Gauge size={17} aria-hidden="true" />}
                        {running ? "Cancel" : "Start Speed Test"}
                    </GlassButton>
                </div>
            </div>
        </div>
    );
}

const serverJobPath = "/api/speed-test/server/job";
const jobErrors = {
    timeout: "The Server Internet Test timed out.",
    agent_disconnected: "The Ubuntu agent lost its control connection.",
    invalid_result: "LibreSpeed returned no valid measurement.",
    cli_failed: "LibreSpeed CLI could not finish the test.",
};

function ServerInternetDashboard() {
    const [data, setData] = useState(null);
    const [pollError, setPollError] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [pendingAction, setPendingAction] = useState(false);
    const mutating = useRef(false);
    const revision = useRef(0);

    useEffect(() => {
        const controller = new AbortController();
        let timer;
        async function poll() {
            const requestedRevision = revision.current;
            try {
                const response = await api(serverJobPath, {
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
                });
                if (!controller.signal.aborted && !mutating.current && requestedRevision === revision.current) {
                    setData(response);
                    setPollError(null);
                }
            } catch {
                if (!controller.signal.aborted) setPollError("Cannot check the server test status. Retrying…");
            }
            if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
        }
        void poll();
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, []);

    async function change(method) {
        if (mutating.current) return;
        mutating.current = true;
        revision.current++;
        setPendingAction(true);
        setActionError(null);
        try {
            const path = method === "DELETE" ? `${serverJobPath}?id=${encodeURIComponent(data.job.id)}` : serverJobPath;
            const { job } = await api(path, { method, signal: AbortSignal.timeout(5000) });
            setData((previous) => ({ ...previous, job }));
        } catch (error) {
            setActionError(error.message);
        } finally {
            mutating.current = false;
            setPendingAction(false);
        }
    }

    if (!data?.enabled) {
        return <p role="status" className={cx("rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground")}>
            {pollError ?? (data ? "Server Internet Test is disabled." : "Checking Server Internet Test…")}
        </p>;
    }
    const job = data.job;
    const phase = ["failed", "expired"].includes(job?.state) ? "error" : job?.state ?? "idle";
    return (
        <div className={cx("space-y-3")}>
            {(actionError || pollError) && <p role="alert" className={cx("text-sm text-destructive")}>{actionError ?? pollError}</p>}
            <TestDashboard
                test={{ ...initialTest, phase, result: job?.result, error: jobErrors[job?.error] }}
                internet pendingAction={pendingAction}
                start={() => change("POST")} cancel={() => change("DELETE")}
            />
        </div>
    );
}

export default function SpeedTest() {
    const active = useRef(null);
    const [selectedTab, setSelectedTab] = useState("server");
    const { user } = useAuth();
    const [test, setTest] = useState(initialTest);
    const visibleTabs = tabs.filter(({ id }) => id !== "server-internet" || user?.role === "admin");

    useEffect(() => () => active.current?.controller.abort(), []);

    async function start() {
        if (active.current) return;
        const controller = new AbortController();
        active.current = { controller };
        setTest({ ...initialTest, phase: "running", stage: 0 });
        try {
            const result = await runLanTest({
                signal: controller.signal,
                onEndpoint: (endpoint) => {
                    if (!controller.signal.aborted) setTest((previous) => ({ ...previous, endpoint }));
                },
                onStage: (message) => {
                    const stage = stages.findIndex((item) => item.message === message);
                    if (stage > 0 && !controller.signal.aborted) setTest((previous) => ({ ...previous, stage }));
                },
            });
            if (!controller.signal.aborted) setTest((previous) => ({ ...previous, phase: "complete", result }));
        } catch (failure) {
            if (!controller.signal.aborted) setTest((previous) => ({ ...previous, phase: "error", error: failure.message }));
        } finally {
            if (active.current?.controller === controller) active.current = null;
        }
    }

    function cancel() {
        active.current?.controller.abort();
        active.current = null;
        setTest((previous) => ({ ...previous, phase: "cancelled" }));
    }

    function navigateTabs(event) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const index = visibleTabs.findIndex(({ id }) => id === selectedTab);
        const count = visibleTabs.length;
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? count - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
        const next = visibleTabs[nextIndex].id;
        setSelectedTab(next);
        event.currentTarget.querySelector(`#speed-test-tab-${next}`)?.focus();
    }

    return (
        <section className={cx("mx-auto w-full max-w-5xl space-y-4 text-card-foreground")}>
            <div role="tablist" aria-label="Speed test mode" onKeyDown={navigateTabs} className={cx("flex w-full flex-wrap gap-1 rounded-xl border border-border bg-muted p-1 sm:w-fit")}>
                {visibleTabs.map(({ id, label, icon: Icon }) => (
                    <GlassButton key={id} id={`speed-test-tab-${id}`} type="button" role="tab"
                        aria-selected={selectedTab === id} aria-controls={`speed-test-panel-${id}`}
                        tabIndex={selectedTab === id ? 0 : -1} onClick={() => setSelectedTab(id)}
                        className={cx("flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium sm:px-5",
                            selectedTab === id ? "bg-card text-card-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground")}>
                        <Icon size={16} aria-hidden="true" />
                        {label}
                    </GlassButton>
                ))}
            </div>

            <div role="tabpanel" id="speed-test-panel-server" aria-labelledby="speed-test-tab-server" hidden={selectedTab !== "server"} className={cx("space-y-4")}>
                <TestDashboard test={test} start={start} cancel={cancel} />
            </div>

            {user?.role === "admin" && (
                <div role="tabpanel" id="speed-test-panel-server-internet" aria-labelledby="speed-test-tab-server-internet" hidden={selectedTab !== "server-internet"}>
                    {selectedTab === "server-internet" && <ServerInternetDashboard />}
                </div>
            )}

            <div role="tabpanel" id="speed-test-panel-internet" aria-labelledby="speed-test-tab-internet" hidden={selectedTab !== "internet"}>
                <div className={cx("grid justify-items-center rounded-2xl border border-border bg-card px-4 py-12 text-center shadow-sm sm:py-16")}>
                    <Globe size={23} aria-hidden="true" />
                    <h2 className={cx("mt-4 text-xl font-semibold tracking-tight")}>Client Internet Test</h2>
                    <p className={cx("mt-1 text-sm text-muted-foreground")}>Coming Soon</p>
                </div>
            </div>
        </section>
    );
}

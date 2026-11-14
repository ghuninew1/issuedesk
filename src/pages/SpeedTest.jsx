import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Check, CircleAlert, Gauge, Globe, Server, Timer } from "lucide-react";
import GlassButton from "../components/GlassButton";
import { getInternetTarget, runInternetTest, runLanTest } from "../services/lanSpeedTest";
import { useAuth } from "../auth/useAuth";
import { cx } from "../utils/cx";

const tabs = [
    { id: "server", label: "Server Test", icon: Server },
    { id: "internet", label: "Internet Test", icon: Globe },
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

function TestDashboard({ test, internet = false, blocked, start, cancel }) {
    const { phase, stage, endpoint, result, error } = test;
    const TargetIcon = internet ? Globe : Server;
    const running = phase === "running";
    const completed = phase === "complete";
    const status = running && stage === 0 && internet ? "Connecting to the Internet endpoint…"
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
                        <h2 className={cx("font-semibold tracking-tight")}>{internet ? "Public HTTPS Endpoint" : "Ubuntu LAN Agent"}</h2>
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
                <TestProgress currentStage={running ? stage : -1} completed={completed} />
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
                    <p role="status" className={cx("text-sm text-muted-foreground")}>{blocked ? "A test is running in the other tab." : error ? "" : status}</p>
                    <GlassButton type="button" disabled={blocked} onClick={running ? cancel : start}
                        className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50",
                            running ? "border-border bg-background" : "border-primary/45 bg-primary/10 text-primary")}>
                        {!running && <Gauge size={17} aria-hidden="true" />}
                        {running ? "Cancel" : "Start Speed Test"}
                    </GlassButton>
                </div>
            </div>
        </div>
    );
}

export default function SpeedTest() {
    const active = useRef(null);
    const [selectedTab, setSelectedTab] = useState("server");
    const { user } = useAuth();
    const [tests, setTests] = useState({ server: initialTest, internet: initialTest });
    const [availability, setAvailability] = useState(null);
    const runningMode = tests.server.phase === "running" ? "server"
        : tests.internet.phase === "running" ? "internet" : null;
    const checkingInternet = selectedTab === "internet" && user?.role === "admin";

    useEffect(() => () => active.current?.controller.abort(), []);

    useEffect(() => {
        if (!checkingInternet) return;
        const controller = new AbortController();
        getInternetTarget(controller.signal)
            .then((endpoint) => {
                if (!controller.signal.aborted) setAvailability({ endpoint });
            })
            .catch(() => {
                if (!controller.signal.aborted) setAvailability({ error: true });
            });
        return () => controller.abort();
    }, [checkingInternet]);

    function updateTest(mode, update) {
        setTests((previous) => ({ ...previous, [mode]: update(previous[mode]) }));
    }

    async function start(mode) {
        if (active.current || (mode === "internet" && !availability?.endpoint)) return;
        const controller = new AbortController();
        active.current = { mode, controller };
        updateTest(mode, () => ({ ...initialTest, phase: "running", stage: 0 }));
        try {
            const options = {
                signal: controller.signal,
                onEndpoint: (target) => {
                    if (!controller.signal.aborted) updateTest(mode, (previous) => ({ ...previous, endpoint: target }));
                },
                onStage: (message) => {
                    const next = stages.findIndex((item) => item.message === message);
                    if (next > 0 && !controller.signal.aborted) {
                        updateTest(mode, (previous) => ({ ...previous, stage: next }));
                    }
                },
            };
            const measured = mode === "internet"
                ? await runInternetTest(options, availability.endpoint)
                : await runLanTest(options);
            if (!controller.signal.aborted) {
                updateTest(mode, (previous) => ({ ...previous, phase: "complete", result: measured }));
            }
        } catch (failure) {
            if (!controller.signal.aborted) {
                updateTest(mode, (previous) => ({ ...previous, phase: "error", error: failure.message }));
            }
        } finally {
            if (active.current?.controller === controller) active.current = null;
        }
    }

    function cancel() {
        const current = active.current;
        if (!current) return;
        current.controller.abort();
        active.current = null;
        updateTest(current.mode, (previous) => ({ ...previous, phase: "cancelled" }));
    }

    function selectTab(tab) {
        if (tab === selectedTab) return;
        if (tab === "internet" && runningMode !== "internet") setAvailability(null);
        setSelectedTab(tab);
    }

    function navigateTabs(event) {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "server"
            : event.key === "End" ? "internet"
            : selectedTab === "server" ? "internet" : "server";
        selectTab(next);
        event.currentTarget.querySelector(`#speed-test-tab-${next}`)?.focus();
    }

    return (
        <section className={cx("mx-auto w-full max-w-5xl space-y-4 text-card-foreground")}>
            <div role="tablist" aria-label="Speed test mode" onKeyDown={navigateTabs} className={cx("grid w-full grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1 sm:w-fit")}>
                {tabs.map(({ id, label, icon: Icon }) => (
                    <GlassButton key={id} id={`speed-test-tab-${id}`} type="button" role="tab"
                        aria-selected={selectedTab === id} aria-controls={`speed-test-panel-${id}`}
                        tabIndex={selectedTab === id ? 0 : -1} onClick={() => selectTab(id)}
                        className={cx("flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium sm:px-5",
                            selectedTab === id ? "bg-card text-card-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground")}>
                        <Icon size={16} aria-hidden="true" />
                        {label}
                    </GlassButton>
                ))}
            </div>

            <div role="tabpanel" id="speed-test-panel-server" aria-labelledby="speed-test-tab-server" hidden={selectedTab !== "server"} className={cx("space-y-4")}>
                <TestDashboard test={tests.server} blocked={runningMode === "internet"} start={() => start("server")} cancel={cancel} />
            </div>

            <div role="tabpanel" id="speed-test-panel-internet" aria-labelledby="speed-test-tab-internet" hidden={selectedTab !== "internet"}>
                {user?.role === "admin" && (availability?.endpoint || runningMode === "internet") ? (
                    <TestDashboard
                        test={tests.internet.endpoint ? tests.internet : { ...tests.internet, endpoint: availability?.endpoint }}
                        internet blocked={runningMode === "server"} start={() => start("internet")} cancel={cancel}
                    />
                ) : (
                    <div className={cx("grid justify-items-center rounded-2xl border border-border bg-card px-4 py-12 text-center shadow-sm sm:py-16")}>
                        <span className={cx("grid size-12 place-items-center rounded-xl border border-border bg-muted text-primary")}>
                            <Globe size={23} aria-hidden="true" />
                        </span>
                        <h2 className={cx("mt-4 text-xl font-semibold tracking-tight")}>Internet Test</h2>
                        <p role="status" className={cx("mt-1 text-sm text-muted-foreground")}>
                            {user?.role !== "admin" ? "Internet testing is available to pilot administrators."
                                : !availability ? "Checking endpoint availability…"
                                : availability.error ? "Internet endpoint unavailable. Reopen this tab to retry."
                                : "Coming Soon"}
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

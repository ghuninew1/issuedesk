import { useCallback, useEffect, useState } from "react";
import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    Bot,
    Cpu,
    Gauge,
    HardDrive,
    History,
    LoaderCircle,
    Network,
    Plus,
    RefreshCw,
    Router,
    Trash2,
    Wifi,
    Clock3,
} from "lucide-react";
import { cx } from "../utils/cx";
import { api } from "../utils/api";

const glassCard = "glass-surface rounded-2xl p-4 md:p-5";
const bangkokStamp = (value) => value
    ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value))
    : "—";
const readableBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
    return `${size.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
};
const readableRate = (value) => Number.isFinite(value) ? `${value.toFixed(value < 10 ? 1 : 0)} Mbps` : "—";

function buildTrafficSeries(snapshots) {
    const ordered = [...snapshots].reverse();
    return ordered.slice(1).map((current, index) => {
        const previous = ordered[index];
        const seconds = (new Date(current.collectedAt).getTime() - new Date(previous.collectedAt).getTime()) / 1000;
        const counters = [
            [previous.wan.ais.rxBytes, current.wan.ais.rxBytes],
            [previous.wan.true.rxBytes, current.wan.true.rxBytes],
            [previous.wan.ais.txBytes, current.wan.ais.txBytes],
            [previous.wan.true.txBytes, current.wan.true.txBytes],
        ];
        if (seconds <= 0 || seconds > 180 || counters.some(([before, after]) => after < before)) {
            return { at: current.collectedAt, download: null, upload: null, ais: null, true: null };
        }
        const rate = (before, after) => ((after - before) * 8) / seconds / 1_000_000;
        const ais = { download: rate(counters[0][0], counters[0][1]), upload: rate(counters[2][0], counters[2][1]) };
        const trueWan = { download: rate(counters[1][0], counters[1][1]), upload: rate(counters[3][0], counters[3][1]) };
        return {
            at: current.collectedAt,
            download: ais.download + trueWan.download,
            upload: ais.upload + trueWan.upload,
            ais,
            true: trueWan,
        };
    });
}

function MetricCard({ icon: Icon, label, value = "—", detail, accent = "text-primary" }) {
    return (
        <section className={cx(glassCard, "min-h-32")}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
                </div>
                <span className="rounded-xl border border-border/70 bg-background/35 p-2.5">
                    <Icon className={cx("size-5", accent)} aria-hidden="true" />
                </span>
            </div>
            {detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}
        </section>
    );
}

function StatusPill({ children, tone = "muted" }) {
    const tones = {
        muted: "border-border/70 bg-muted/40 text-muted-foreground",
        good: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    };

    return (
        <span className={cx("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone])}>
            <span className={cx("size-1.5 rounded-full", tone === "good" ? "bg-emerald-500" : "bg-muted-foreground/60")} />
            {children}
        </span>
    );
}

function WanCard({ name, wan, rates }) {
    const known = Boolean(wan);
    return (
        <article className="rounded-xl border border-border/70 bg-background/25 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="rounded-lg border border-border/70 bg-background/40 p-2">
                        <Wifi className="size-4 text-primary" aria-hidden="true" />
                    </span>
                    <div>
                        <h3 className="text-sm font-medium">{name}</h3>
                        <p className="text-xs text-muted-foreground">{wan?.interface || "รอข้อมูล Interface"}</p>
                    </div>
                </div>
                <StatusPill tone={known && wan.running ? "good" : "muted"}>
                    {!known ? "ยังไม่มีข้อมูล" : wan.running ? "Interface connected" : "Interface down"}
                </StatusPill>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
                <div>
                    <p className="text-xs text-muted-foreground">Download</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><ArrowDownToLine className="size-4 text-sky-500" />{readableRate(rates?.download)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Upload</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><ArrowUpFromLine className="size-4 text-violet-500" />{readableRate(rates?.upload)}</p>
                </div>
            </div>
        </article>
    );
}

function TrafficChart({ series }) {
    const valid = series.filter((point) => point.download !== null && point.upload !== null);
    if (!valid.length) {
        return (
            <div className="relative mt-5 flex h-52 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-background/20 md:h-64">
                <div className="absolute inset-0 flex flex-col justify-between px-4 py-5" aria-hidden="true">
                    {[0, 1, 2, 3].map((line) => <div key={line} className="border-t border-dashed border-border/50" />)}
                </div>
                <div className="relative flex max-w-xs flex-col items-center px-5 text-center">
                    <Activity className="size-6 text-muted-foreground/70" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium">ยังไม่มีข้อมูล Traffic</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">กราฟจะแสดงเมื่อ Agent ส่ง Snapshot อย่างน้อย 2 ครั้ง</p>
                </div>
            </div>
        );
    }
    const max = Math.max(1, ...valid.flatMap((point) => [point.download, point.upload]));
    const line = (key) => valid.map((point, index) => {
        const x = valid.length === 1 ? 400 : (index / (valid.length - 1)) * 760 + 20;
        const y = 190 - (point[key] / max) * 170;
        return `${x},${y}`;
    }).join(" ");
    return (
        <div className="mt-5 h-52 overflow-hidden rounded-xl border border-border/50 bg-background/20 p-3 md:h-64">
            <svg viewBox="0 0 800 220" className="size-full" role="img" aria-label="Traffic download and upload over the latest samples">
                {[20, 75, 130, 190].map((y) => <line key={y} x1="20" x2="780" y1={y} y2={y} className="stroke-border/60" strokeDasharray="4 6" />)}
                <polyline points={line("download")} fill="none" stroke="rgb(14 165 233)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={line("upload")} fill="none" stroke="rgb(139 92 246)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
        </div>
    );
}

function NetworkMonitor() {
    const [pingTargets, setPingTargets] = useState([{ id: "initial", value: "" }]);
    const [pingCheck, setPingCheck] = useState(null);
    const [knownPingTargets, setKnownPingTargets] = useState([]);
    const [pingLoading, setPingLoading] = useState(false);
    const [deletingPingIp, setDeletingPingIp] = useState("");
    const [pingError, setPingError] = useState("");
    const [status, setStatus] = useState(null);
    const [snapshots, setSnapshots] = useState([]);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [viewerError, setViewerError] = useState("");

    const load = useCallback(async () => {
        try {
            const [current, history, eventHistory, latestPingCheck] = await Promise.all([
                api("/api/network/status"),
                api("/api/network/history?hours=24&limit=3000"),
                api("/api/network/events?limit=100"),
                api("/api/network/ping/check"),
            ]);
            setStatus(current);
            setSnapshots(history.snapshots || []);
            setEvents(eventHistory.events || []);
            setPingCheck(latestPingCheck.check);
            setKnownPingTargets(latestPingCheck.knownTargets || []);
            setError("");
        } catch (cause) {
            setError(cause.message || "โหลดข้อมูล Network Monitoring ไม่สำเร็จ");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        let released = false;
        const viewerId = window.crypto.randomUUID();
        const leaseBody = JSON.stringify({ viewerId });
        const renewViewerLease = async () => {
            try {
                await api("/api/network/viewers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: leaseBody,
                });
                if (mounted) setViewerError("");
            } catch (cause) {
                if (mounted) setViewerError(cause.message || "เปิดการตรวจสอบ Network Monitoring ไม่สำเร็จ");
            }
        };
        const releaseViewerLease = () => {
            if (released) return;
            released = true;
            void fetch("/api/network/viewers", {
                method: "DELETE",
                credentials: "same-origin",
                keepalive: true,
                headers: { "Content-Type": "application/json" },
                body: leaseBody,
            }).catch(() => undefined);
        };

        void (async () => {
            await renewViewerLease();
            if (mounted) await load();
        })();
        const leaseTimer = window.setInterval(() => { void renewViewerLease(); }, 30_000);
        const dataTimer = window.setInterval(() => { void load(); }, 30_000);
        window.addEventListener("pagehide", releaseViewerLease);
        return () => {
            mounted = false;
            window.clearInterval(leaseTimer);
            window.clearInterval(dataTimer);
            window.removeEventListener("pagehide", releaseViewerLease);
            releaseViewerLease();
        };
    }, [load]);

    useEffect(() => {
        if (!pingCheck?.id || pingCheck.status === "completed") return undefined;
        let mounted = true;
        const refreshPingCheck = async () => {
            try {
                const result = await api(`/api/network/ping/check?id=${encodeURIComponent(pingCheck.id)}`);
                if (mounted) {
                    setPingCheck(result.check);
                    setKnownPingTargets(result.knownTargets || []);
                    setPingError("");
                }
            } catch (cause) {
                if (mounted) setPingError(cause.message || "อ่านผล Ping ไม่สำเร็จ");
            }
        };
        void refreshPingCheck();
        const timer = window.setInterval(() => { void refreshPingCheck(); }, 3_000);
        return () => {
            mounted = false;
            window.clearInterval(timer);
        };
    }, [pingCheck?.id, pingCheck?.status]);

    const updatePingTarget = (id, value) => {
        setPingTargets((current) => current.map((target) => target.id === id ? { ...target, value } : target));
        const duplicate = knownPingTargets.find((target) => target.ipAddress === value.trim());
        if (duplicate) setPingError(`IP ${duplicate.ipAddress} มีอยู่ในรายการที่เคยเช็คแล้ว`);
    };

    const queuePingCheck = async (targets, recheck = false) => {
        const knownIps = new Set(knownPingTargets.map((target) => target.ipAddress));
        if (!recheck) {
            const duplicates = targets.filter((target) => knownIps.has(target));
            if (duplicates.length) {
                setPingError(`มี IP นี้อยู่ในรายการแล้ว: ${duplicates.join(", ")}`);
                return;
            }
        }
        setPingLoading(true);
        setPingError("");
        try {
            const result = await api("/api/network/ping/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targets, recheck }),
            });
            const requestedAt = new Date().toISOString();
            setPingCheck({
                id: result.checkId,
                status: result.status,
                requestedAt,
                results: result.targets.map((ipAddress) => ({ ipAddress, status: "pending", latencyMs: null, checkedAt: null })),
            });
            setKnownPingTargets((current) => {
                const byIp = new Map(current.map((target) => [target.ipAddress, target]));
                for (const ipAddress of result.targets) {
                    byIp.set(ipAddress, { ipAddress, status: "pending", latencyMs: null, checkedAt: null });
                }
                return [...byIp.values()].sort((left, right) => left.ipAddress.localeCompare(right.ipAddress));
            });
        } catch (cause) {
            setPingError(cause.message || "ส่งคำขอ Ping ไม่สำเร็จ");
        } finally {
            setPingLoading(false);
        }
    };

    const submitPingCheck = async (event) => {
        event.preventDefault();
        const entered = pingTargets.map((target) => target.value.trim()).filter(Boolean);
        const targets = [...new Set(entered)];
        if (!targets.length) {
            setPingError("กรอก IP อย่างน้อย 1 หมายเลขก่อนกดเช็ค");
            return;
        }
        if (targets.length !== entered.length) {
            setPingError("มี IP ซ้ำอยู่ในช่องที่กรอก กรุณาลบรายการที่ซ้ำก่อนเช็ค");
            return;
        }
        await queuePingCheck(targets);
    };

    const addPingTargetField = () => {
        const latestEntry = pingTargets.at(-1)?.value.trim();
        if (latestEntry && knownPingTargets.some((target) => target.ipAddress === latestEntry)) {
            setPingError(`IP ${latestEntry} มีอยู่ในรายการที่เคยเช็คแล้ว`);
            return;
        }
        if (pingTargets.length >= 20) return;
        setPingError("");
        setPingTargets((current) => [...current, { id: window.crypto.randomUUID(), value: "" }]);
    };

    const deletePingTarget = async (ipAddress) => {
        setDeletingPingIp(ipAddress);
        setPingError("");
        try {
            await api(`/api/network/ping/check?ip=${encodeURIComponent(ipAddress)}`, { method: "DELETE" });
            setKnownPingTargets((current) => current.filter((target) => target.ipAddress !== ipAddress));
            setPingCheck((current) => current ? {
                ...current,
                results: (current.results || []).filter((target) => target.ipAddress !== ipAddress),
            } : current);
        } catch (cause) {
            setPingError(cause.message || `ลบประวัติ ${ipAddress} ไม่สำเร็จ`);
        } finally {
            setDeletingPingIp("");
        }
    };

    const snapshot = status?.snapshot;
    const agentOnline = status?.agent?.online === true;
    const memoryPercent = snapshot?.router.memoryTotalBytes
        ? Math.round(((snapshot.router.memoryTotalBytes - snapshot.router.memoryFreeBytes) / snapshot.router.memoryTotalBytes) * 100)
        : null;
    const traffic = buildTrafficSeries(snapshots);
    const latestRates = traffic[traffic.length - 1];

    return (
        <div className="mx-auto max-w-7xl space-y-5 md:space-y-6">
            <header className="glass-surface flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between md:p-6">
                <div className="flex items-center gap-4">
                    <span className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary shadow-[inset_0_1px_0_var(--glass-highlight)]">
                        <Activity className="size-6" aria-hidden="true" />
                    </span>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Network Monitoring</h1>
                        <p className="mt-1 text-sm text-muted-foreground">ภาพรวม Router และ WAN · เก็บข้อมูลขณะเปิดหน้านี้เท่านั้น</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 self-start sm:self-auto">
                    <StatusPill tone={agentOnline ? "good" : "muted"}>
                        {loading && !status ? "กำลังโหลด" : agentOnline ? "Agent Online" : snapshot ? "Agent Offline" : "รอข้อมูลจาก Agent"}
                    </StatusPill>
                    <button
                        type="button"
                        onClick={() => { setLoading(true); void load(); }}
                        disabled={loading}
                        title="รีเฟรชข้อมูล"
                        className="inline-flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/30 text-muted-foreground transition hover:bg-[var(--glass-surface-hover)] disabled:opacity-50"
                        aria-label="รีเฟรชข้อมูล"
                    >
                        <RefreshCw className={cx("size-4", loading && "animate-spin")} aria-hidden="true" />
                    </button>
                </div>
            </header>

            {error && <div role="alert" className="glass-surface rounded-xl border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">โหลดข้อมูล Network Monitoring ไม่สำเร็จ: {error}</div>}
            {viewerError && <div role="alert" className="glass-surface rounded-xl border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">ยังเริ่มการเก็บข้อมูลตามการเปิดหน้านี้ไม่ได้: {viewerError}</div>}
            {snapshot && !agentOnline && <div role="status" className="glass-surface rounded-xl border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">กำลังแสดง Snapshot ล่าสุดจาก {bangkokStamp(snapshot.collectedAt)} · Heartbeat เกินเกณฑ์ที่กำหนด</div>}

            <section className={cx(glassCard, "space-y-4")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold">เช็ค Ping อุปกรณ์</h2>
                        <p className="mt-1 text-sm text-muted-foreground">ใส่ IP ในวง 192.168.11.x ได้สูงสุด 20 เครื่อง แล้วกดเช็คเพื่อให้ Agent บน QNAP ตรวจสอบ</p>
                    </div>
                    <StatusPill tone={pingCheck?.status === "completed" ? "good" : "muted"}>
                        {pingCheck?.status === "completed" ? "ตรวจเสร็จแล้ว" : pingCheck?.status === "running" ? "กำลังตรวจ" : pingCheck ? "รอ Agent" : "พร้อมตรวจ"}
                    </StatusPill>
                </div>
                <form onSubmit={submitPingCheck} className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {pingTargets.map((target, index) => (
                            <label key={target.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-background/25 p-2">
                                <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{index + 1}</span>
                                <input
                                    value={target.value}
                                    onChange={(event) => updatePingTarget(target.id, event.target.value)}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder="192.168.11.50"
                                    aria-label={`IP address ${index + 1}`}
                                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground/60"
                                />
                                <button
                                    type="button"
                                    onClick={() => setPingTargets((current) => current.length > 1 ? current.filter((item) => item.id !== target.id) : current.map((item) => ({ ...item, value: "" })))}
                                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[var(--glass-surface-hover)] hover:text-foreground"
                                    aria-label={`ลบช่อง IP ${index + 1}`}
                                >
                                    <Trash2 className="size-4" aria-hidden="true" />
                                </button>
                            </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            disabled={pingTargets.length >= 20}
                            onClick={addPingTargetField}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/70 bg-background/30 px-3 text-sm transition hover:bg-[var(--glass-surface-hover)] disabled:opacity-50"
                        >
                            <Plus className="size-4" aria-hidden="true" />เพิ่ม IP
                        </button>
                        <button
                            type="submit"
                            disabled={pingLoading || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {pingLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Wifi className="size-4" aria-hidden="true" />}
                            {pingLoading ? "กำลังส่งคำขอ" : "เช็ค Ping"}
                        </button>
                        <span className="text-xs text-muted-foreground">ไม่ตอบ Ping อาจเกิดจากอุปกรณ์ปิดกั้น ICMP ไม่ได้ยืนยันว่าเครื่องปิดอยู่</span>
                    </div>
                </form>
                {pingError && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">{pingError}</p>}
                <div className="space-y-2">
                    <h3 className="text-sm font-medium">IP ที่เคยเช็ค ({knownPingTargets.length})</h3>
                    {knownPingTargets.length ? (
                        <div className="overflow-hidden rounded-xl border border-border/60">
                            {knownPingTargets.map((result) => (
                                <div key={result.ipAddress} className="grid gap-3 border-b border-border/50 bg-background/15 px-3 py-3 last:border-b-0 sm:grid-cols-[minmax(120px,1fr)_minmax(115px,0.8fr)_minmax(150px,1.2fr)_auto] sm:items-center">
                                    <span className="font-mono text-sm">{result.ipAddress}</span>
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className={cx(
                                            "size-2 shrink-0 rounded-full",
                                            result.status === "online" && "bg-emerald-500",
                                            result.status === "offline" && "bg-rose-500",
                                            result.status === "pending" && "animate-pulse bg-amber-500",
                                            result.status === "error" && "bg-muted-foreground",
                                        )} />
                                        <span className={cx(
                                            result.status === "online" && "text-emerald-600 dark:text-emerald-300",
                                            result.status === "offline" && "text-rose-600 dark:text-rose-300",
                                            (result.status === "pending" || result.status === "error") && "text-muted-foreground",
                                        )}>
                                            {result.status === "online" ? "ออนไลน์" : result.status === "offline" ? "ไม่ตอบ Ping" : result.status === "error" ? "เช็คไม่สำเร็จ" : "รอ Agent"}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span className="font-medium text-foreground">{result.status === "online" ? `${Number(result.latencyMs).toFixed(2)} ms` : "— ms"}</span>
                                        <span>เช็คล่าสุด {bangkokStamp(result.checkedAt)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 sm:justify-end">
                                        <button
                                            type="button"
                                            disabled={pingLoading || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                                            onClick={() => { void queuePingCheck([result.ipAddress], true); }}
                                            className="h-9 rounded-lg border border-border/70 bg-background/30 px-3 text-xs font-medium transition hover:bg-[var(--glass-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                        >เช็คซ้ำ</button>
                                        <button
                                            type="button"
                                            disabled={deletingPingIp === result.ipAddress || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                                            onClick={() => { void deletePingTarget(result.ipAddress); }}
                                            className="h-9 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 text-xs font-medium text-rose-600 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
                                        >{deletingPingIp === result.ipAddress ? "กำลังลบ" : "ลบข้อมูล"}</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="rounded-xl border border-dashed border-border/70 px-4 py-5 text-center text-sm text-muted-foreground">ยังไม่มี IP ที่เคยเช็ค</p>
                    )}
                </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <section className={cx(glassCard, "sm:col-span-2 xl:col-span-1")}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm text-muted-foreground">Router</p>
                            <p className="mt-2 text-base font-semibold">{snapshot?.router.identity || "MikroTik Router"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{snapshot ? `Snapshot ${bangkokStamp(snapshot.collectedAt)}` : "ยังไม่มีข้อมูลสถานะ"}</p>
                        </div>
                        <span className="rounded-xl border border-border/70 bg-background/35 p-2.5"><Router className="size-5 text-primary" aria-hidden="true" /></span>
                    </div>
                </section>
                <section className={cx(glassCard, "sm:col-span-2 xl:col-span-1")}>
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-sm text-muted-foreground">Monitoring Agent</p>
                            <p className="mt-2 text-base font-semibold">QNAP</p>
                            <p className="mt-1 text-xs text-muted-foreground">Heartbeat ล่าสุด {bangkokStamp(status?.agent?.lastHeartbeatAt)}</p>
                        </div>
                        <span className="rounded-xl border border-border/70 bg-background/35 p-2.5"><Bot className="size-5 text-primary" aria-hidden="true" /></span>
                    </div>
                </section>
                <MetricCard icon={Cpu} label="CPU Load" value={snapshot ? `${snapshot.router.cpuLoad}%` : "—"} detail={snapshot ? `อัปเดต ${bangkokStamp(snapshot.collectedAt)}` : "รอ Snapshot แรก"} accent="text-sky-500" />
                <MetricCard icon={HardDrive} label="RAM Usage" value={memoryPercent === null ? "—" : `${memoryPercent}%`} detail={snapshot ? `${readableBytes(snapshot.router.memoryTotalBytes - snapshot.router.memoryFreeBytes)} / ${readableBytes(snapshot.router.memoryTotalBytes)}` : "รอ Snapshot แรก"} accent="text-violet-500" />
                <MetricCard icon={Clock3} label="Uptime" value={snapshot?.router.uptime || "—"} detail={snapshot?.router.temperatureC === null || snapshot?.router.temperatureC === undefined ? "รอ Snapshot แรก" : `อุณหภูมิ ${snapshot.router.temperatureC}°C`} accent="text-emerald-500" />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <section className={cx(glassCard, "xl:col-span-2")}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <Network className="size-5 text-primary" aria-hidden="true" />
                            <h2 className="font-semibold">สถานะ WAN</h2>
                        </div>
                        <span className="text-xs text-muted-foreground">ตรวจจากสถานะ Interface และ Counter</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <WanCard name="AIS PPPoE" wan={snapshot?.wan.ais} rates={latestRates?.ais} />
                        <WanCard name="True PPPoE" wan={snapshot?.wan.true} rates={latestRates?.true} />
                    </div>
                </section>

                <section className={cx(glassCard, "flex flex-col")}>
                    <div className="flex items-center gap-2.5">
                        <Router className="size-5 text-primary" aria-hidden="true" />
                        <h2 className="font-semibold">ข้อมูลอุปกรณ์ MikroTik</h2>
                    </div>
                    <div className="mt-4 flex flex-1 flex-col justify-center rounded-xl border border-dashed border-border/70 bg-background/20 p-4 text-center">
                        <Gauge className="mx-auto size-6 text-muted-foreground/70" aria-hidden="true" />
                        <p className="mt-3 text-sm font-medium">{snapshot?.router.identity || "รอข้อมูลอุปกรณ์"}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{snapshot ? `RouterOS Snapshot · ${bangkokStamp(snapshot.collectedAt)}` : "CPU, หน่วยความจำ, อุณหภูมิ และ Uptime จะแสดงเมื่อ Agent เชื่อมต่อ"}</p>
                    </div>
                </section>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
                <section className={cx(glassCard, "xl:col-span-2")}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5"><Activity className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">Traffic รวม</h2></div>
                        <span className="rounded-lg border border-border/70 bg-background/25 px-3 py-1.5 text-xs text-muted-foreground">24 ชั่วโมง</span>
                    </div>
                    <TrafficChart series={traffic} />
                </section>
                <section className={cx(glassCard, "flex flex-col")}>
                    <div className="flex items-center gap-2.5"><Network className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">Traffic แยกตาม WAN</h2></div>
                    <div className="mt-4 grid flex-1 content-start gap-3">
                        {[{ name: "AIS", rates: latestRates?.ais }, { name: "True", rates: latestRates?.true }].map((wan) => (
                            <div key={wan.name} className="rounded-xl border border-border/70 bg-background/20 p-3.5">
                                <div className="flex items-center justify-between"><p className="text-sm font-medium">{wan.name}</p><span className="text-xs text-muted-foreground">↓ {readableRate(wan.rates?.download)}</span></div>
                                <p className="mt-2 text-xs text-muted-foreground">↑ {readableRate(wan.rates?.upload)} · {snapshot?.collectedAt ? bangkokStamp(snapshot.collectedAt) : "รอข้อมูล Rate"}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <section className={cx(glassCard, "grid gap-5 xl:grid-cols-[1.4fr_1fr]")}>
                <div>
                    <div className="flex items-center gap-2.5"><History className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">Event History</h2></div>
                    <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/20 px-4 text-center">
                        <div>
                            <p className="text-sm font-medium">{events.length ? "เหตุการณ์ล่าสุด" : "ยังไม่มีเหตุการณ์"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">WAN และ Agent events จะแสดงที่นี่</p>
                        </div>
                    </div>
                    {events.length > 0 && (
                        <ul className="mt-3 divide-y divide-border/60 rounded-xl border border-border/60 bg-background/20 px-3">
                            {events.slice(0, 5).map((event) => (
                                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
                                    <span className="min-w-0"><span className="font-medium">{event.type.replaceAll("_", " ")}</span><span className="ml-2 text-muted-foreground">{event.description}</span></span>
                                    <span className="shrink-0 text-muted-foreground">{bangkokStamp(event.occurredAt)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div>
                    <div className="flex items-center gap-2.5"><Activity className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">สรุปสถานะเครือข่าย</h2></div>
                    <ul className="mt-4 divide-y divide-border/60 rounded-xl border border-border/60 bg-background/20 px-3">
                        {[
                            { name: "Router", value: snapshot ? "Snapshot received" : "ไม่มีข้อมูล", good: Boolean(snapshot) },
                            { name: "Monitoring Agent", value: agentOnline ? "Online" : snapshot ? "Offline" : "ไม่มีข้อมูล", good: agentOnline },
                            { name: "AIS WAN Interface", value: snapshot ? snapshot.wan.ais.running ? "Connected" : "Down" : "ไม่มีข้อมูล", good: snapshot?.wan.ais.running === true },
                            { name: "True WAN Interface", value: snapshot ? snapshot.wan.true.running ? "Connected" : "Down" : "ไม่มีข้อมูล", good: snapshot?.wan.true.running === true },
                        ].map((item) => (
                            <li key={item.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                                <span className="text-muted-foreground">{item.name}</span>
                                <StatusPill tone={item.good ? "good" : "muted"}>{item.value}</StatusPill>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
}

export default NetworkMonitor;

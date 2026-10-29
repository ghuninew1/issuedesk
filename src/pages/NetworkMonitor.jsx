import GlassButton from "../components/GlassButton";
import { useCallback, useEffect, useState } from "react";
import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    Bot,
    Cpu,
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
            <div className="flex justify-between items-start gap-3">
                <div>
                    <p className="text-muted-foreground text-sm">{label}</p>
                    <p className="mt-3 font-semibold text-2xl tracking-tight">{value}</p>
                </div>
                <span className="bg-background/35 p-2.5 border border-border/70 rounded-xl">
                    <Icon className={cx("size-5", accent)} aria-hidden="true" />
                </span>
            </div>
            {detail && <p className="mt-2 text-muted-foreground text-xs">{detail}</p>}
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
        <article className="bg-background/25 p-4 border border-border/70 rounded-xl">
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="bg-background/40 p-2 border border-border/70 rounded-lg">
                        <Wifi className="size-4 text-primary" aria-hidden="true" />
                    </span>
                    <div>
                        <h3 className="font-medium text-sm">{name}</h3>
                        <p className="text-muted-foreground text-xs">{wan?.interface || "รอข้อมูล Interface"}</p>
                    </div>
                </div>
                <StatusPill tone={known && wan.running ? "good" : "muted"}>
                    {!known ? "ยังไม่มีข้อมูล" : wan.running ? "Interface connected" : "Interface down"}
                </StatusPill>
            </div>
            <div className="gap-3 grid grid-cols-2 mt-5 pt-4 border-border/60 border-t">
                <div>
                    <p className="text-muted-foreground text-xs">Download</p>
                    <p className="flex items-center gap-1.5 mt-1 font-medium text-sm"><ArrowDownToLine className="size-4 text-sky-500" />{readableRate(rates?.download)}</p>
                </div>
                <div>
                    <p className="text-muted-foreground text-xs">Upload</p>
                    <p className="flex items-center gap-1.5 mt-1 font-medium text-sm"><ArrowUpFromLine className="size-4 text-violet-500" />{readableRate(rates?.upload)}</p>
                </div>
            </div>
            <div className="gap-x-4 gap-y-2 grid grid-cols-2 mt-4 text-xs">
                <div><p className="text-muted-foreground">Public IP</p><p className="mt-1 font-mono">{wan?.ipAddress || "ไม่มีข้อมูลจาก Agent"}</p></div>
                <div><p className="text-muted-foreground">PPPoE Uptime</p><p className="mt-1">ไม่มีข้อมูลใน Snapshot</p></div>
                <div><p className="text-muted-foreground">RX รวม</p><p className="mt-1">{wan ? readableBytes(wan.rxBytes) : "—"}</p></div>
                <div><p className="text-muted-foreground">TX รวม</p><p className="mt-1">{wan ? readableBytes(wan.txBytes) : "—"}</p></div>
            </div>
        </article>
    );
}

function TrafficChart({ series }) {
    const valid = series.filter((point) => point.download !== null && point.upload !== null);
    if (!valid.length) {
        return (
            <div className="relative flex justify-center items-center bg-background/20 mt-5 border border-border/50 rounded-xl h-52 md:h-64 overflow-hidden">
                <div className="absolute inset-0 flex flex-col justify-between px-4 py-5" aria-hidden="true">
                    {[0, 1, 2, 3].map((line) => <div key={line} className="border-border/50 border-t border-dashed" />)}
                </div>
                <div className="relative flex flex-col items-center px-5 max-w-xs text-center">
                    <Activity className="size-6 text-muted-foreground/70" aria-hidden="true" />
                    <p className="mt-3 font-medium text-sm">ยังไม่มีข้อมูล Traffic</p>
                    <p className="mt-1 text-muted-foreground text-xs leading-5">กราฟจะแสดงเมื่อ Agent ส่ง Snapshot อย่างน้อย 2 ครั้ง</p>
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
        <div className="bg-background/20 mt-5 p-3 border border-border/50 rounded-xl h-52 md:h-64 overflow-hidden">
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
    const [recheckingAll, setRecheckingAll] = useState(false);
    const [recheckAllProgress, setRecheckAllProgress] = useState("");
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
            return result.checkId;
        } catch (cause) {
            setPingError(cause.message || "ส่งคำขอ Ping ไม่สำเร็จ");
            return null;
        } finally {
            setPingLoading(false);
        }
    };

    const recheckAllPingTargets = async () => {
        if (!knownPingTargets.length || recheckingAll) return;
        const batches = [];
        for (let index = 0; index < knownPingTargets.length; index += 20) {
            batches.push(knownPingTargets.slice(index, index + 20).map((target) => target.ipAddress));
        }
        setRecheckingAll(true);
        setPingError("");
        try {
            for (const [index, targets] of batches.entries()) {
                setRecheckAllProgress(`กำลังเช็คชุดที่ ${index + 1}/${batches.length}`);
                const checkId = await queuePingCheck(targets, true);
                if (!checkId) return;

                let completed = false;
                for (let attempt = 0; attempt < 90; attempt += 1) {
                    await new Promise((resolve) => window.setTimeout(resolve, 2_000));
                    const result = await api(`/api/network/ping/check?id=${encodeURIComponent(checkId)}`);
                    setPingCheck(result.check);
                    setKnownPingTargets(result.knownTargets || []);
                    if (result.check?.status === "completed") {
                        completed = true;
                        break;
                    }
                }
                if (!completed) {
                    setPingError("การเช็คใช้เวลานานเกินไป หยุดการเช็คชุดถัดไปแล้ว กรุณาตรวจสถานะ Agent");
                    return;
                }
            }
            setPingError("");
        } catch (cause) {
            setPingError(cause.message || "เช็ค Ping ทั้งหมดไม่สำเร็จ");
        } finally {
            setRecheckingAll(false);
            setRecheckAllProgress("");
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
        <div className="space-y-5 md:space-y-6 mx-auto max-w-7xl">
            <header className="flex sm:flex-row flex-col sm:justify-between sm:items-center gap-4 p-5 md:p-6 rounded-2xl glass-surface">
                <div className="flex items-center gap-4">
                    <span className="bg-primary/10 shadow-[inset_0_1px_0_var(--glass-highlight)] p-3 border border-primary/20 rounded-2xl text-primary">
                        <Activity className="size-6" aria-hidden="true" />
                    </span>
                    <div>
                        <h1 className="font-semibold text-xl md:text-2xl tracking-tight">Network Monitoring</h1>
                        <p className="mt-1 text-muted-foreground text-sm">ภาพรวม Router และ WAN · เก็บข้อมูลขณะเปิดหน้านี้เท่านั้น</p>
                    </div>
                </div>
                <div className="flex items-center self-start sm:self-auto gap-3">
                    <StatusPill tone={agentOnline ? "good" : "muted"}>
                        {loading && !status ? "กำลังโหลด" : agentOnline ? "Agent Online" : snapshot ? "Agent Offline" : "รอข้อมูลจาก Agent"}
                    </StatusPill>
                    <GlassButton
                        type="button"
                        onClick={() => { setLoading(true); void load(); }}
                        disabled={loading}
                        title="รีเฟรชข้อมูล"
                        className={cx("inline-flex justify-center items-center bg-background/30 hover:bg-[var(--glass-surface-hover)] disabled:opacity-50 border border-border/70 rounded-xl size-10 text-muted-foreground transition")}
                        aria-label="รีเฟรชข้อมูล"
                    >
                        <RefreshCw className={cx("size-4", loading && "animate-spin")} aria-hidden="true" />
                    </GlassButton>
                </div>
            </header>

            {error && <div role="alert" className="bg-amber-500/5 px-4 py-3 border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-200 text-sm glass-surface">โหลดข้อมูล Network Monitoring ไม่สำเร็จ: {error}</div>}
            {viewerError && <div role="alert" className="bg-amber-500/5 px-4 py-3 border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-200 text-sm glass-surface">ยังเริ่มการเก็บข้อมูลตามการเปิดหน้านี้ไม่ได้: {viewerError}</div>}
            {snapshot && !agentOnline && <div role="status" className="bg-amber-500/5 px-4 py-3 border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-200 text-sm glass-surface">กำลังแสดง Snapshot ล่าสุดจาก {bangkokStamp(snapshot.collectedAt)} · Heartbeat เกินเกณฑ์ที่กำหนด</div>}

            <section className={cx(glassCard, "space-y-4")}>
                <div className="flex flex-wrap justify-between items-center gap-3">
                    <div><h2 className="font-semibold">Router Health</h2><p className="mt-1 text-muted-foreground text-xs">{snapshot ? `Snapshot ${bangkokStamp(snapshot.collectedAt)}` : "รอ Snapshot จาก Router"}</p></div>
                    <StatusPill tone={agentOnline ? "good" : "muted"}>{agentOnline ? "Agent Online" : snapshot ? "แสดงข้อมูลล่าสุด · Agent Offline" : "ยังไม่มีข้อมูล"}</StatusPill>
                </div>
                <div className="gap-3 grid sm:grid-cols-2 xl:grid-cols-5">
                <section className={cx(glassCard, "sm:col-span-2 xl:col-span-1")}>
                    <div className="flex justify-between items-start gap-3">
                        <div>
                            <p className="text-muted-foreground text-sm">Router</p>
                            <p className="mt-2 font-semibold text-base">{snapshot?.router.identity || "MikroTik Router"}</p>
                            <p className="mt-1 text-muted-foreground text-xs">{snapshot ? `Snapshot ${bangkokStamp(snapshot.collectedAt)}` : "ยังไม่มีข้อมูลสถานะ"}</p>
                        </div>
                        <span className="bg-background/35 p-2.5 border border-border/70 rounded-xl"><Router className="size-5 text-primary" aria-hidden="true" /></span>
                    </div>
                </section>
                <section className={cx(glassCard, "sm:col-span-2 xl:col-span-1")}>
                    <div className="flex justify-between items-start gap-3">
                        <div>
                            <p className="text-muted-foreground text-sm">Monitoring Agent</p>
                            <p className="mt-2 font-semibold text-base">QNAP</p>
                            <p className="mt-1 text-muted-foreground text-xs">Heartbeat ล่าสุด {bangkokStamp(status?.agent?.lastHeartbeatAt)}</p>
                        </div>
                        <span className="bg-background/35 p-2.5 border border-border/70 rounded-xl"><Bot className="size-5 text-primary" aria-hidden="true" /></span>
                    </div>
                </section>
                <MetricCard icon={Cpu} label="CPU Load" value={snapshot ? `${snapshot.router.cpuLoad}%` : "—"} detail={snapshot ? `อัปเดต ${bangkokStamp(snapshot.collectedAt)}` : "รอ Snapshot แรก"} accent="text-sky-500" />
                <MetricCard icon={HardDrive} label="RAM Usage" value={memoryPercent === null ? "—" : `${memoryPercent}%`} detail={snapshot ? `${readableBytes(snapshot.router.memoryTotalBytes - snapshot.router.memoryFreeBytes)} / ${readableBytes(snapshot.router.memoryTotalBytes)}` : "รอ Snapshot แรก"} accent="text-violet-500" />
                <MetricCard icon={Clock3} label="Uptime" value={snapshot?.router.uptime || "—"} detail={snapshot ? "Router uptime" : "รอ Snapshot แรก"} accent="text-emerald-500" />
                </div>
            </section>

            <div className="gap-4 grid xl:grid-cols-2">
                <section className={cx(glassCard)}>
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <div className="flex items-center gap-2.5">
                            <Network className="size-5 text-primary" aria-hidden="true" />
                            <h2 className="font-semibold">สถานะ WAN</h2>
                        </div>
                        <span className="text-muted-foreground text-xs">สถานะ Interface ไม่ได้ยืนยันการเข้าถึงอินเทอร์เน็ต</span>
                    </div>
                    <div className="gap-3 grid md:grid-cols-2 mt-4">
                        <WanCard name="AIS PPPoE" wan={snapshot?.wan.ais} rates={latestRates?.ais} />
                        <WanCard name="True PPPoE" wan={snapshot?.wan.true} rates={latestRates?.true} />
                    </div>
                </section>
                <section className={cx(glassCard)}>
                    <div className="flex items-center gap-2.5"><Network className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">Traffic แยกตาม WAN</h2></div>
                    <div className="gap-3 grid sm:grid-cols-2 mt-4">
                        {[{ name: "AIS", rates: latestRates?.ais }, { name: "True", rates: latestRates?.true }].map((wan) => (
                            <div key={wan.name} className="bg-background/20 p-3.5 border border-border/70 rounded-xl">
                                <p className="font-medium text-sm">{wan.name}</p>
                                <div className="flex flex-wrap justify-between gap-2 mt-3 text-xs">
                                    <span className="text-muted-foreground">↓ {readableRate(wan.rates?.download)}</span>
                                    <span className="text-muted-foreground">↑ {readableRate(wan.rates?.upload)}</span>
                                </div>
                                <p className="mt-2 text-muted-foreground text-xs">{snapshot?.collectedAt ? bangkokStamp(snapshot.collectedAt) : "รอข้อมูล Rate"}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <div>
                <section className={cx(glassCard)}>
                    <div className="flex flex-wrap justify-between items-center gap-3">
                        <div className="flex items-center gap-2.5"><Activity className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">WAN RX / TX History</h2></div>
                        <span className="bg-background/25 px-3 py-1.5 border border-border/70 rounded-lg text-muted-foreground text-xs">24 ชั่วโมง</span>
                    </div>
                    <TrafficChart series={traffic} />
                    <p className="mt-3 text-muted-foreground text-xs">คำนวณจาก WAN byte counters ใน snapshots · API ยังไม่มีประวัติ CPU/RAM, latency หรือ packet loss</p>
                </section>
            </div>

            <section className={cx(glassCard, "grid gap-5 xl:grid-cols-[1.4fr_1fr]")}>
                <div>
                    <div className="flex items-center gap-2.5"><History className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">Event History</h2></div>
                    <div className="flex justify-center items-center bg-background/20 mt-4 px-4 border border-border/70 border-dashed rounded-xl min-h-15 text-center">
                        <div>
                            <p className="font-medium text-sm">{events.length ? "เหตุการณ์ล่าสุด" : "ยังไม่มีเหตุการณ์"}</p>
                            <p className="mt-1 text-muted-foreground text-xs">API ปัจจุบันรองรับ WAN transitions และ Agent heartbeat เท่านั้น</p>
                        </div>
                    </div>
                    {events.length > 0 && (
                        <ul className="bg-background/20 mt-3 px-3 border border-border/60 rounded-xl divide-y divide-border/60">
                            {events.slice(0, 5).map((event) => (
                                <li key={event.id} className="flex flex-wrap justify-between items-center gap-2 py-2.5 text-xs">
                                    <span className="min-w-0"><span className="font-medium">{event.type.replaceAll("_", " ")}</span><span className="ml-2 text-muted-foreground">{event.description}</span></span>
                                    <span className="text-muted-foreground shrink-0">{bangkokStamp(event.occurredAt)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div>
                    <div className="flex items-center gap-2.5"><Activity className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">สรุปสถานะเครือข่าย</h2></div>
                    <ul className="bg-background/20 mt-4 px-3 border border-border/60 rounded-xl divide-y divide-border/60">
                        {[
                            { name: "Router", value: snapshot ? "Snapshot received" : "ไม่มีข้อมูล", good: Boolean(snapshot) },
                            { name: "Monitoring Agent", value: agentOnline ? "Online" : snapshot ? "Offline" : "ไม่มีข้อมูล", good: agentOnline },
                            { name: "AIS WAN Interface", value: snapshot ? snapshot.wan.ais.running ? "Connected" : "Down" : "ไม่มีข้อมูล", good: snapshot?.wan.ais.running === true },
                            { name: "True WAN Interface", value: snapshot ? snapshot.wan.true.running ? "Connected" : "Down" : "ไม่มีข้อมูล", good: snapshot?.wan.true.running === true },
                        ].map((item) => (
                            <li key={item.name} className="flex justify-between items-center gap-3 py-3 text-sm">
                                <span className="text-muted-foreground">{item.name}</span>
                                <StatusPill tone={item.good ? "good" : "muted"}>{item.value}</StatusPill>
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
            <section className={cx(glassCard, "space-y-4")} aria-labelledby="ping-monitor-heading">
                <div className="flex flex-wrap justify-between items-start gap-3">
                    <div>
                        <h2 id="ping-monitor-heading" className="font-semibold">Ping Monitor</h2>
                        <p className="mt-1 text-muted-foreground text-sm">ใส่ IP ในวง 192.168.11.x ได้สูงสุด 20 เครื่อง แล้วกดเช็คเพื่อให้ Agent บน QNAP ตรวจสอบ</p>
                    </div>
                    <StatusPill tone={pingCheck?.status === "completed" ? "good" : "muted"}>
                        {pingCheck?.status === "completed" ? "ตรวจเสร็จแล้ว" : pingCheck?.status === "running" ? "กำลังตรวจ" : pingCheck ? "รอ Agent" : "พร้อมตรวจ"}
                    </StatusPill>
                </div>
                <form onSubmit={submitPingCheck} className="space-y-3">
                    <div className="gap-2 grid sm:grid-cols-2 xl:grid-cols-4">
                        {pingTargets.map((target, index) => (
                            <label key={target.id} className="flex items-center gap-2 bg-background/25 p-2 border border-border/70 rounded-xl min-w-0">
                                <span className="w-6 text-muted-foreground text-xs text-center shrink-0">{index + 1}</span>
                                <input
                                    value={target.value}
                                    onChange={(event) => updatePingTarget(target.id, event.target.value)}
                                    inputMode="decimal"
                                    autoComplete="off"
                                    placeholder="192.168.11.50"
                                    aria-label={`IP address ${index + 1}`}
                                    className="flex-1 bg-transparent px-1 py-1.5 outline-none min-w-0 placeholder:font-sans font-mono placeholder:text-muted-foreground/60 text-sm"
                                />
                                <GlassButton
                                    type="button"
                                    onClick={() => setPingTargets((current) => current.length > 1 ? current.filter((item) => item.id !== target.id) : current.map((item) => ({ ...item, value: "" })))}
                                    className={cx("inline-flex justify-center items-center hover:bg-[var(--glass-surface-hover)] rounded-lg size-8 text-muted-foreground hover:text-foreground transition shrink-0")}
                                    aria-label={`ลบช่อง IP ${index + 1}`}
                                >
                                    <Trash2 className="size-4" aria-hidden="true" />
                                </GlassButton>
                            </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <GlassButton
                            type="button"
                            disabled={pingTargets.length >= 20 || recheckingAll}
                            onClick={addPingTargetField}
                            className={cx("inline-flex items-center gap-2 bg-background/30 hover:bg-[var(--glass-surface-hover)] disabled:opacity-50 px-3 border border-border/70 rounded-xl h-10 text-sm transition")}
                        >
                            <Plus className="size-4" aria-hidden="true" />เพิ่ม IP
                        </GlassButton>
                        <GlassButton
                            type="submit"
                            disabled={pingLoading || recheckingAll || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                            className={cx("inline-flex items-center gap-2 bg-primary hover:opacity-90 disabled:opacity-50 shadow-sm px-4 rounded-xl h-10 font-medium text-primary-foreground text-sm transition disabled:cursor-not-allowed")}
                        >
                            {pingLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Wifi className="size-4" aria-hidden="true" />}
                            {pingLoading ? "กำลังส่งคำขอ" : "เช็ค Ping"}
                        </GlassButton>
                        <span className="text-muted-foreground text-xs">ไม่ตอบ Ping อาจเกิดจากอุปกรณ์ปิดกั้น ICMP ไม่ได้ยืนยันว่าเครื่องปิดอยู่</span>
                    </div>
                </form>
                {pingError && <p role="alert" className="text-amber-700 dark:text-amber-300 text-sm">{pingError}</p>}
                <div className="space-y-2">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                        <h3 className="font-medium text-sm">IP ที่เคยเช็ค ({knownPingTargets.length})</h3>
                        <GlassButton
                            type="button"
                            disabled={!knownPingTargets.length || recheckingAll || pingLoading || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                            onClick={() => { void recheckAllPingTargets(); }}
                            className={cx("inline-flex items-center gap-2 bg-background/30 hover:bg-[var(--glass-surface-hover)] disabled:opacity-50 px-3 border border-border/70 rounded-lg h-9 font-medium text-xs transition disabled:cursor-not-allowed")}
                        >
                            {recheckingAll ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-3.5" aria-hidden="true" />}
                            {recheckingAll ? recheckAllProgress || "กำลังเช็คทั้งหมด" : "เช็คซ้ำทั้งหมด"}
                        </GlassButton>
                    </div>
                    {knownPingTargets.length ? (
                        <div className="border border-border/60 rounded-xl overflow-hidden">
                            {knownPingTargets.map((result) => (
                                <div key={result.ipAddress} className="sm:items-center gap-3 grid sm:grid-cols-[minmax(120px,1fr)_minmax(115px,0.8fr)_minmax(150px,1.2fr)_auto] bg-background/15 px-3 py-3 border-border/50 border-b last:border-b-0">
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
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                                        <span className="font-medium text-foreground">{result.status === "online" ? `${Number(result.latencyMs).toFixed(2)} ms` : "— ms"}</span>
                                        <span>เช็คล่าสุด {bangkokStamp(result.checkedAt)}</span>
                                    </div>
                                    <div className="flex sm:justify-end items-center gap-2">
                                        <GlassButton
                                            type="button"
                                            disabled={pingLoading || recheckingAll || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                                            onClick={() => { void queuePingCheck([result.ipAddress], true); }}
                                            className={cx("bg-background/30 hover:bg-[var(--glass-surface-hover)] disabled:opacity-50 px-3 border border-border/70 rounded-lg h-9 font-medium text-xs transition disabled:cursor-not-allowed")}
                                        >เช็คซ้ำ</GlassButton>
                                        <GlassButton
                                            type="button"
                                            disabled={deletingPingIp === result.ipAddress || recheckingAll || pingCheck?.status === "pending" || pingCheck?.status === "running"}
                                            onClick={() => { void deletePingTarget(result.ipAddress); }}
                                            className={cx("bg-rose-500/5 hover:bg-rose-500/10 disabled:opacity-50 px-3 border border-rose-500/20 rounded-lg h-9 font-medium text-rose-600 dark:text-rose-300 text-xs transition disabled:cursor-not-allowed")}
                                        >{deletingPingIp === result.ipAddress ? "กำลังลบ" : "ลบข้อมูล"}</GlassButton>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="px-4 py-5 border border-border/70 border-dashed rounded-xl text-muted-foreground text-sm text-center">ยังไม่มี IP ที่เคยเช็ค</p>
                    )}
                </div>
            </section>

        </div>
    );
}

export default NetworkMonitor;

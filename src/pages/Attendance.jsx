import { cx } from "../utils/cx";
import GlassButton from "../components/GlassButton";
import { useCallback, useEffect, useState } from "react";
import {
    Activity,
    ArrowDownToLine,
    ArrowUpFromLine,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Search,
    ShieldAlert,
    Users,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { api } from "../utils/api";

const dateFormatter = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full" });
const timeFormatter = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});
const stamp = (value) => (value ? timeFormatter.format(new Date(value)) : "—");
const duration = (seconds = 0) => {
    const minutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
    return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
};
const glass =
    "rounded-[1.5rem] border border-white/70 bg-white/65 shadow-[inset_0_1px_0_rgba(255,255,255,.85),0_18px_48px_rgba(30,64,95,.08)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/65";

function Metric({ icon: Icon, label, value, tone = "text-slate-700" }) {
    return (
        <div className={`${glass} p-5`}>
            <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="rounded-xl bg-white/70 p-2 text-slate-500 dark:bg-white/10">
                    <Icon size={17} />
                </span>
            </div>
            <div className={`mt-4 text-3xl font-semibold tracking-tight dark:text-white ${tone}`}>{value}</div>
        </div>
    );
}

function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(`${value}T12:00:00+07:00`));
}

export default function Attendance() {
    const { user } = useAuth();
    const admin = user?.role === "admin";
    const [today, setToday] = useState(null);
    const [history, setHistory] = useState([]);
    const [summary, setSummary] = useState({ working: 0, completed: 0, abnormal: 0, total: 0, totalDurationSeconds: 0 });
    const [records, setRecords] = useState([]);
    const [durationAsOf, setDurationAsOf] = useState(null);
    const [durationTick, setDurationTick] = useState(0);
    const [totalDurationSeconds, setTotalDurationSeconds] = useState(0);
    const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [date, setDate] = useState("");
    const [search, setSearch] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const load = useCallback(async () => {
        try {
            const current = await api("/api/attendance/today");
            setToday(current.record);
            if (admin) {
                const [stats, list] = await Promise.all([
                    api("/api/admin/attendance/summary"),
                    api(
                        `/api/admin/attendance/records?page=${page}&limit=30${date ? `&date=${encodeURIComponent(date)}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`,
                    ),
                ]);
                setSummary(stats.summary);
                setRecords(list.records);
                setPagination(list.pagination);
                setDurationAsOf(list.durationAsOf);
            } else {
                const result = await api("/api/attendance/history?limit=20");
                setHistory(result.records);
                setTotalDurationSeconds(result.totalDurationSeconds);
                setDurationAsOf(result.durationAsOf);
            }
            setError("");
        } catch (cause) {
            setError(cause.message);
        }
    }, [admin, page, date, search]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void load();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    useEffect(() => {
        const initialTick = window.setTimeout(() => setDurationTick(Date.now()), 0);
        const timer = window.setInterval(() => setDurationTick(Date.now()), 60_000);
        return () => {
            window.clearTimeout(initialTick);
            window.clearInterval(timer);
        };
    }, []);

    async function punch(action) {
        setPending(true);
        setError("");
        setNotice("");
        try {
            await api(`/api/attendance/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            setNotice(action === "check-in" ? "เช็คอินเรียบร้อยแล้ว" : "เช็คเอาต์เรียบร้อยแล้ว");
            await load();
        } catch (cause) {
            setError(cause.message);
        } finally {
            setPending(false);
        }
    }

    const working = today?.status === "working";
    const liveSeconds = durationAsOf ? Math.max(0, Math.floor((durationTick - new Date(durationAsOf).getTime()) / 1000)) : 0;
    const userTotalSeconds = totalDurationSeconds + (working ? liveSeconds : 0);
    const adminTotalSeconds = summary.totalDurationSeconds + (durationAsOf ? liveSeconds : 0);
    return (
        <div className="mx-auto max-w-7xl space-y-7 pb-8">
            <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-cyan-50/90 via-white/70 to-indigo-100/80 p-6 shadow-[inset_0_1px_0_white,0_24px_70px_rgba(45,95,125,.1)] backdrop-blur-3xl dark:border-white/10 dark:from-slate-900/95 dark:via-slate-900/75 dark:to-indigo-950/75 md:p-9">
                <div className="pointer-events-none absolute -right-16 -top-28 size-80 rounded-full bg-cyan-300/30 blur-3xl dark:bg-cyan-500/15" />
                <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-end">
                    <div>
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/55 px-3 py-1.5 text-xs font-medium text-slate-600 backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                            <Activity size={14} className="text-cyan-600" /> TIME ATTENDANCE
                        </div>
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-4xl">
                            ลงเวลาทำงาน
                        </h1>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            {admin
                                ? "ภาพรวมการเข้างานของทีมวันนี้"
                                : `สวัสดี ${user?.name || ""} · บันทึกเวลาเข้าและออกงานของคุณ`}
                        </p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/55 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
                        <CalendarDays size={18} className="text-cyan-700 dark:text-cyan-300" />
                        <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-white">
                                {dateFormatter.format(new Date())} : {timeFormatter.format(new Date())}
                            </p>
                            <p className="text-xs text-muted-foreground">เวลาประเทศไทย · Asia/Bangkok</p>
                        </div>
                    </div>
                </div>
                {!admin && (
                    <div className="relative mx-auto mt-8 flex w-full max-w-3xl flex-col items-center gap-5">
                        <div className="grid w-full grid-cols-[auto_1fr] gap-3 rounded-2xl border border-white/80 bg-white/50 p-4 backdrop-blur-xl md:grid-cols-[1fr_auto] md:items-center dark:border-white/10 dark:bg-white/5">
                            <span
                                className={`grid size-11 place-items-center rounded-2xl ${working ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300" : today?.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-white/10"}`}
                            >
                                <Clock3 size={20} />
                            </span>
                            <div>
                                <p className="text-xs text-muted-foreground">สถานะวันนี้</p>
                                <p className="font-semibold text-slate-900 dark:text-white">
                                    {working
                                        ? "กำลังทำงาน"
                                        : today?.status === "completed"
                                          ? "ลงเวลาครบแล้ว"
                                          : "ยังไม่ได้เช็คอิน"}
                                </p>
                            </div>
                            <div className="col-span-2 grid grid-cols-2 gap-3 text-sm md:col-span-2">
                                <span className="text-muted-foreground">
                                    เข้า{" "}
                                    <b className="ml-1 text-slate-800 dark:text-white">{stamp(today?.check_in_at)}</b>
                                </span>
                                <span className="text-muted-foreground">
                                    ออก{" "}
                                    <b className="ml-1 text-slate-800 dark:text-white">{stamp(today?.check_out_at)}</b>
                                </span>
                            </div>
                        </div>
                        {!today ? (
                            <GlassButton
                                disabled={pending}
                                onClick={() => punch("check-in")}
                                className={cx("inline-flex h-16 w-full max-w-lg items-center justify-center gap-3 rounded-2xl bg-slate-900 px-8 text-lg font-semibold text-white shadow-xl shadow-cyan-900/15 transition hover:-translate-y-0.5 hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/40 disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400")}
                            >
                                <ArrowDownToLine size={21} /> เช็คอิน
                            </GlassButton>
                        ) : working ? (
                            <GlassButton
                                disabled={pending}
                                onClick={() => punch("check-out")}
                                className={cx("inline-flex h-16 w-full max-w-lg items-center justify-center gap-3 rounded-2xl bg-amber-500 px-8 text-lg font-semibold text-white shadow-xl shadow-amber-900/15 transition hover:-translate-y-0.5 hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300/50 disabled:opacity-50")}
                            >
                                <ArrowUpFromLine size={21} /> เช็คเอาต์
                            </GlassButton>
                        ) : (
                            <span className="inline-flex h-14 w-full max-w-lg items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-6 font-medium text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-400/10 dark:text-emerald-300">
                                <Check size={18} /> เสร็จสิ้นวันนี้
                            </span>
                        )}
                    </div>
                )}
            </section>
            {error && (
                <div
                    role="alert"
                    className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 dark:border-rose-300/20 dark:bg-rose-400/10 dark:text-rose-200"
                >
                    {error}
                </div>
            )}
            {notice && (
                <div
                    role="status"
                    className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                >
                    {notice}
                </div>
            )}
            {admin ? (
                <>
                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <Metric icon={Users} label="รายการทั้งหมด" value={summary.total} />
                        <Metric
                            icon={Activity}
                            label="กำลังทำงานวันนี้"
                            value={summary.working}
                            tone="text-amber-600"
                        />
                        <Metric
                            icon={Check}
                            label="เช็คเอาต์แล้ววันนี้"
                            value={summary.completed}
                            tone="text-emerald-600"
                        />
                        <Metric
                            icon={ShieldAlert}
                            label="รายการค้างจากวันก่อน"
                            value={summary.abnormal}
                            tone="text-rose-600"
                        />
                        <Metric icon={Clock3} label="เวลาทำงานรวม" value={duration(adminTotalSeconds)} tone="text-cyan-700" />
                    </section>
                    <section className={`${glass} overflow-hidden`}>
                        <div className="flex flex-col justify-between gap-4 border-b border-slate-200/70 p-5 dark:border-white/10 md:flex-row md:items-center">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    รายการลงเวลาทีม
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">ข้อมูลสำหรับตรวจสอบ · ดูอย่างเดียว</p>
                            </div>
                            <div className="grid w-full gap-2 md:flex md:w-auto">
                                <label className="relative">
                                    <Search
                                        size={15}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                    />
                                    <input
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setPage(1);
                                        }}
                                        placeholder="ค้นหาชื่อหรืออีเมล"
                                        className="h-10 w-full rounded-xl border border-slate-200/80 bg-white/60 pl-9 pr-3 text-sm outline-none focus:border-cyan-400 md:w-56 dark:border-white/10 dark:bg-white/5"
                                    />
                                </label>
                                <input
                                    aria-label="กรองวันที่"
                                    type="date"
                                    value={date}
                                    onChange={(e) => {
                                        setDate(e.target.value);
                                        setPage(1);
                                    }}
                                    className="h-10 w-full rounded-xl border border-slate-200/80 bg-white/60 px-3 text-sm outline-none focus:border-cyan-400 md:w-auto dark:border-white/10 dark:bg-white/5"
                                />
                            </div>
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[680px] text-left text-sm">
                                <thead className="bg-white/35 text-xs uppercase tracking-wide text-muted-foreground dark:bg-white/[.02]">
                                    <tr>
                                        {["พนักงาน", "วันที่", "เช็คอิน", "เช็คเอาต์", "เวลารวม", "สถานะ"].map((heading) => (
                                            <th key={heading} className="px-5 py-3 font-medium">
                                                {heading}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/60 dark:divide-white/10">
                                    {records.map((record) => (
                                        <tr
                                            key={record.id}
                                            className="transition hover:bg-white/40 dark:hover:bg-white/[.03]"
                                        >
                                            <td className="px-5 py-4">
                                                <p className="font-medium text-slate-900 dark:text-white">
                                                    {record.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{record.email}</p>
                                            </td>
                                            <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                                                {formatDate(record.work_date)}
                                            </td>
                                            <td className="px-5 py-4 tabular-nums">{stamp(record.check_in_at)}</td>
                                            <td className="px-5 py-4 tabular-nums">{stamp(record.check_out_at)}</td>
                                            <td className="px-5 py-4 whitespace-nowrap tabular-nums">{duration(record.work_duration_seconds + (record.status === "working" && record.work_date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()) ? liveSeconds : 0))}</td>
                                            <td className="px-5 py-4">
                                                <span
                                                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${record.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"}`}
                                                >
                                                    {record.status === "completed"
                                                        ? "เสร็จสิ้น"
                                                        : record.work_date <
                                                            new Date().toLocaleDateString("en-CA", {
                                                                timeZone: "Asia/Bangkok",
                                                            })
                                                          ? "ผิดปกติ"
                                                          : "กำลังทำงาน"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                    {records.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="px-5 py-12 text-center text-muted-foreground">
                                                ไม่พบรายการลงเวลา
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="space-y-3 p-3 md:hidden">
                            {records.map((record) => {
                                const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
                                const isCurrentWorkday = record.work_date === todayDate;
                                const isAbnormal = record.status === "working" && record.work_date < todayDate;
                                const recordSeconds = record.work_duration_seconds + (record.status === "working" && isCurrentWorkday ? liveSeconds : 0);
                                return (
                                    <article key={record.id} className="rounded-2xl border border-white/70 bg-white/45 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] dark:border-white/10 dark:bg-white/[.04]">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h3 className="truncate font-semibold text-slate-900 dark:text-white">{record.name}</h3>
                                                <p className="mt-0.5 break-all text-xs text-muted-foreground">{record.email}</p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${record.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : isAbnormal ? "bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"}`}>
                                                {record.status === "completed" ? "เสร็จสิ้น" : isAbnormal ? "ผิดปกติ" : "กำลังทำงาน"}
                                            </span>
                                        </div>
                                        <p className="mt-3 border-b border-slate-200/70 pb-2 text-xs text-muted-foreground dark:border-white/10">{formatDate(record.work_date)}</p>
                                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                            <div><p className="text-xs text-muted-foreground">เช็คอิน</p><p className="mt-1 font-medium tabular-nums text-slate-800 dark:text-white">{stamp(record.check_in_at)}</p></div>
                                            <div><p className="text-xs text-muted-foreground">เช็คเอาต์</p><p className="mt-1 font-medium tabular-nums text-slate-800 dark:text-white">{stamp(record.check_out_at)}</p></div>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between rounded-xl bg-cyan-50/80 px-3 py-2 text-sm dark:bg-cyan-400/[.08]">
                                            <span className="text-muted-foreground">เวลาทำงานรวม</span>
                                            <span className="font-semibold tabular-nums text-cyan-800 dark:text-cyan-200">{duration(recordSeconds)}</span>
                                        </div>
                                    </article>
                                );
                            })}
                            {records.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">ไม่พบรายการลงเวลา</p>}
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-200/70 px-4 py-4 text-sm dark:border-white/10 md:px-5">
                            <span className="text-muted-foreground">ทั้งหมด {pagination.total} รายการ</span>
                            <div className="flex items-center gap-2">
                                <GlassButton
                                    aria-label="หน้าก่อน"
                                    disabled={page <= 1}
                                    onClick={() => setPage((n) => n - 1)}
                                    className={cx("rounded-lg border border-slate-200/70 p-2 disabled:opacity-40 dark:border-white/10")}
                                >
                                    <ChevronLeft size={16} />
                                </GlassButton>
                                <span>
                                    {page} / {pagination.pages}
                                </span>
                                <GlassButton
                                    aria-label="หน้าถัดไป"
                                    disabled={page >= pagination.pages}
                                    onClick={() => setPage((n) => n + 1)}
                                    className={cx("rounded-lg border border-slate-200/70 p-2 disabled:opacity-40 dark:border-white/10")}
                                >
                                    <ChevronRight size={16} />
                                </GlassButton>
                            </div>
                        </div>
                    </section>
                </>
            ) : (
                <section className={`${glass} overflow-hidden`}>
                    <div className="flex items-center justify-between border-b border-slate-200/70 p-5 dark:border-white/10">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">ประวัติการลงเวลา</h2>
                            <p className="mt-1 text-sm text-muted-foreground">รายการของคุณ · เวลารวม {duration(userTotalSeconds)}</p>
                        </div>
                        <span className="rounded-xl bg-cyan-100/70 p-2.5 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200">
                            <CalendarDays size={18} />
                        </span>
                    </div>
                    <div className="divide-y divide-slate-200/60 dark:divide-white/10">
                        {history.map((record) => (
                            <div
                                key={record.id}
                                className="grid gap-3 px-4 py-4 md:flex md:items-center md:justify-between md:px-5"
                            >
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">
                                        {formatDate(record.work_date)}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {record.status === "completed"
                                            ? "เช็คอินและเช็คเอาต์ครบ"
                                            : record.work_date <
                                                new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
                                              ? "ลืมเช็คเอาต์ · ตรวจสอบกับผู้ดูแล"
                                              : "กำลังทำงาน"}
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/35 p-3 text-xs dark:bg-white/[.03] md:flex md:flex-wrap md:gap-6 md:bg-transparent md:p-0 md:text-sm dark:md:bg-transparent">
                                    <span className="text-muted-foreground">
                                        เข้า{" "}
                                        <b className="ml-1 text-slate-800 dark:text-white">
                                            {stamp(record.check_in_at)}
                                        </b>
                                    </span>
                                    <span className="text-muted-foreground">
                                        ออก{" "}
                                        <b className="ml-1 text-slate-800 dark:text-white">
                                            {stamp(record.check_out_at)}
                                        </b>
                                    </span>
                                            <span className="text-muted-foreground">รวม <b className="ml-1 text-slate-800 dark:text-white">{duration(record.check_in_at && record.check_out_at ? (new Date(record.check_out_at).getTime() - new Date(record.check_in_at).getTime()) / 1000 : record.status === "working" && record.work_date === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()) ? (durationTick - new Date(record.check_in_at).getTime()) / 1000 : 0)}</b></span>
                                </div>
                            </div>
                        ))}
                        {history.length === 0 && (
                            <p className="px-5 py-12 text-center text-muted-foreground">ยังไม่มีประวัติการลงเวลา</p>
                        )}
                    </div>
                </section>
            )}
        </div>
    );
}

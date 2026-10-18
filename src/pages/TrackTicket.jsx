import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, Clock3, Headset, Search, ShieldCheck } from "lucide-react";
import ThemeToggle from "../theme/ThemeToggle";
import { api } from "../utils/api";
import { cx } from "../utils/cx";

const STATUS_LABELS = {
    Open: "รับเรื่องแล้ว",
    "In Progress": "กำลังดำเนินการ",
    Resolved: "แก้ไขเรียบร้อย",
};

function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function TrackTicket() {
    const { ticketNumber } = useParams();
    const [lookup, setLookup] = useState(null);

    useEffect(() => {
        const controller = new AbortController();
        api(`/api/track/${encodeURIComponent(ticketNumber)}`, { signal: controller.signal })
            .then((result) => setLookup({ ticketNumber, ticket: result.ticket, error: "" }))
            .catch((requestError) => {
                if (requestError.name !== "AbortError") {
                    setLookup({ ticketNumber, ticket: null, error: requestError.message || "ไม่พบ Ticket นี้" });
                }
            });
        return () => controller.abort();
    }, [ticketNumber]);

    const isLoading = lookup?.ticketNumber !== ticketNumber;
    const ticket = isLoading ? null : lookup.ticket;
    const error = isLoading ? "" : lookup.error;
    const isResolved = ticket?.status === "Resolved";
    const isInProgress = ticket?.status === "In Progress";

    return (
        <main className="min-h-screen bg-background text-foreground selection:bg-cyan-500 selection:text-white">
            <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

            <header className="border-b border-border">
                <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5 sm:px-8">
                    <Link to="/" className="flex items-center gap-3" aria-label="กลับหน้าหลัก IssueDesk">
                        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                            <Headset size={22} />
                        </span>
                        <span>
                            <span className="block text-base font-semibold">IssueDesk</span>
                            <span className="block text-xs text-muted-foreground">IT Support Center</span>
                        </span>
                    </Link>
                    <ThemeToggle />
                </div>
            </header>

            <section className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
                <Link
                    to="/"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft size={16} />
                    กลับหน้าหลัก
                </Link>
                <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Search size={18} />
                        <span>ติดตาม Ticket</span>
                        <ShieldCheck size={17} className="ml-auto" />
                    </div>
                    <h1 className="mt-4 text-2xl font-semibold">สถานะการแจ้งปัญหา</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Ticket Number: <span className="font-medium text-foreground">{ticketNumber}</span>
                    </p>

                    {isLoading && (
                        <p className="mt-8 text-sm text-muted-foreground" role="status">
                            กำลังค้นหา Ticket…
                        </p>
                    )}
                    {error && (
                        <p
                            className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}

                    {ticket && (
                        <>
                            <div className="mt-8 flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                                <span
                                    className={cx(
                                        "flex size-11 items-center justify-center rounded-full",
                                        isResolved
                                            ? "bg-emerald-500/10 text-emerald-600"
                                            : "bg-primary/10 text-primary",
                                    )}
                                >
                                    {isResolved ? <CheckCircle2 size={22} /> : <Clock3 size={22} />}
                                </span>
                                <div>
                                    <p className="text-xs text-muted-foreground">สถานะปัจจุบัน</p>
                                    <p className="mt-1 font-semibold">
                                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                                    </p>
                                </div>
                            </div>

                            <ol className="mt-8 space-y-5" aria-label="ความคืบหน้า Ticket">
                                <li className="flex gap-3">
                                    <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                                    <div>
                                        <p className="text-sm font-medium">รับเรื่องแล้ว</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {formatDate(ticket.created_at)}
                                        </p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    {isInProgress || isResolved ? (
                                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                                    ) : (
                                        <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                                    )}
                                    <div>
                                        <p
                                            className={cx(
                                                "text-sm",
                                                isInProgress || isResolved ? "font-medium" : "text-muted-foreground",
                                            )}
                                        >
                                            กำลังดำเนินการ
                                        </p>
                                    </div>
                                </li>
                                <li className="flex gap-3">
                                    {isResolved ? (
                                        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
                                    ) : (
                                        <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                                    )}
                                    <div>
                                        <p
                                            className={cx(
                                                "text-sm",
                                                isResolved ? "font-medium" : "text-muted-foreground",
                                            )}
                                        >
                                            แก้ไขเรียบร้อย
                                        </p>
                                        {isResolved && (
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                อัปเดตล่าสุด {formatDate(ticket.updated_at)}
                                            </p>
                                        )}
                                    </div>
                                </li>
                            </ol>
                        </>
                    )}
                </div>
                <p className="mt-5 text-center text-xs text-muted-foreground">
                    ข้อมูลนี้แสดงเฉพาะเลข Ticket และสถานะ โดยไม่เปิดเผยรายละเอียดที่ผู้แจ้งส่งมา
                </p>
            </section>
        </main>
    );
}

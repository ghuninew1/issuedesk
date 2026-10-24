import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
    ArrowLeft,
    CheckCircle2,
    Search,
    ShieldCheck,
    Tickets,
    TicketsPlane,
    TicketCheck,
    TicketPercent,
    Loader,
} from "lucide-react";
import { api } from "../utils/api";
import { cx } from "../utils/cx";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const STATUS_LABELS = {
    Open: "รับเรื่องแล้ว",
    "In Progress": "กำลังดำเนินการ",
    Resolved: "แก้ไขเรียบร้อย",
};

const PROGRESS_STEPS = [
    { label: "รับเรื่องแล้ว", Icon: Tickets },
    { label: "กำลังดำเนินการ", Icon: TicketsPlane },
    { label: "แก้ไขปัญหา", Icon: TicketPercent },
    { label: "เสร็จสิ้น", Icon: TicketCheck },
];

function parseDate(value) {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
        return new Date(`${value.replace(" ", "T")}Z`);
    }
    return new Date(value);
}

function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(parseDate(value));
}

function formatTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).format(
        parseDate(value),
    );
}

export default function TrackTicket() {
    const { ticketNumber } = useParams();
    const [lookup, setLookup] = useState(null);

    useDocumentTitle(ticketNumber ? `Track ${ticketNumber}` : "Issue Tracking");

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
    const currentStep = ticket?.status === "Resolved" ? 3 : ticket?.status === "In Progress" ? 1 : 0;
    const currentStatusLabel = ticket ? (STATUS_LABELS[ticket.status] ?? ticket.status) : "";
    const activity = ticket
        ? [
              { label: "ได้รับแจ้งปัญหาแล้ว", time: ticket.created_at },
              ...(ticket.status === "In Progress" || ticket.status === "Resolved"
                  ? [{ label: "กำลังดำเนินการตรวจสอบและแก้ไข", time: ticket.in_progress_at }]
                  : []),
              ...(ticket.status === "Resolved"
                  ? [{ label: "ดำเนินการแก้ไขเรียบร้อยแล้ว", time: ticket.updated_at }]
                  : []),
          ]
        : [];

    return (
        <section className="relative z-10 mx-auto max-w-2xl px-5 py-12 md:px-8 animate-fadeInUp">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft size={16} aria-hidden="true" className="animate-bounceLeft transition-all" />
                กลับหน้าหลัก
            </Link>

            <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Search size={18} aria-hidden="true" />
                    <span>ติดตาม Ticket</span>
                    <ShieldCheck size={17} className="ml-auto" aria-hidden="true" />
                </div>
                <h1 className="mt-4 text-2xl font-semibold">สถานะการแจ้งปัญหา</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                    Ticket Number: <span className="font-medium text-foreground">{ticketNumber}</span>
                </p>

                {isLoading && (
                    <p className="mt-8 text-sm text-muted-foreground gap-2 flex items-center" role="status">
                        <Loader className="animate-spin" />
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
                        <section
                            className="mt-8 rounded-xl border border-border bg-muted/30 px-3 pb-4 pt-5 md:px-5"
                            aria-label="ขั้นตอนการดำเนินงาน"
                        >
                            <ol className="mx-auto flex items-start">
                                {PROGRESS_STEPS.map(({ label, Icon }, index) => {
                                    const isComplete = index <= currentStep;
                                    const isCurrent = index === currentStep;

                                    return (
                                        <li
                                            key={label}
                                            className="relative flex min-w-0 flex-1 flex-col items-center text-center"
                                        >
                                            {index > 0 && (
                                                <span
                                                    aria-hidden="true"
                                                    className={cx(
                                                        "absolute right-1/2 top-[21px] h-0.5 w-full",
                                                        index <= currentStep
                                                            ? "bg-green-500"
                                                            : "bg-muted-foreground/30",
                                                    )}
                                                />
                                            )}
                                            <span
                                                className={cx(
                                                    "relative z-10 flex size-[42px] items-center justify-center rounded-full",
                                                    isComplete
                                                        ? "bg-green-500 text-primary-foreground"
                                                        : "bg-muted-foreground/30 text-muted",
                                                    isCurrent && "ring-4 ring-primary/15",
                                                )}
                                            >
                                                <Icon size={23} strokeWidth={2.2} aria-hidden="true" />
                                            </span>
                                            <span
                                                className={cx(
                                                    "mt-2 max-w-[76px] text-[11px] leading-4 md:max-w-none md:text-xs",
                                                    isComplete ? "text-foreground" : "text-muted-foreground",
                                                    isCurrent && "font-semibold",
                                                )}
                                            >
                                                {label}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ol>
                            <p className="mx-auto mt-4 max-w-3xl text-right text-xs text-primary">
                                สถานะปัจจุบัน: {currentStatusLabel}
                            </p>
                        </section>

                        <h2 className="mb-5 mt-8 text-sm font-medium text-muted-foreground">
                            ความเคลื่อนไหวของ Ticket
                        </h2>
                        <ol className="space-y-0" aria-label="รายการแจ้งเตือน Ticket">
                            {activity.map((item, index) => (
                                <li
                                    key={`${item.label}-${index}`}
                                    className="grid grid-cols-[76px_22px_minmax(0,1fr)] gap-2 md:grid-cols-[100px_28px_minmax(0,1fr)] md:gap-3"
                                >
                                    <time
                                        dateTime={item.time ? parseDate(item.time).toISOString() : undefined}
                                        className="pt-1 text-right text-xs leading-5 text-muted-foreground md:text-sm"
                                    >
                                        {item.time ? (
                                            <>
                                                <span className="block">{formatDate(item.time)}</span>
                                                <span className="block">{formatTime(item.time)} น.</span>
                                            </>
                                        ) : (
                                            <span className="block">ไม่พบเวลาบันทึก</span>
                                        )}
                                    </time>
                                    <span className="relative flex justify-center">
                                        {index < activity.length - 1 && (
                                            <span
                                                aria-hidden="true"
                                                className="absolute bottom-0 top-5 border-l-2 border-dotted border-primary/50"
                                            />
                                        )}
                                        <CheckCircle2
                                            size={20}
                                            className="relative z-10 mt-1 shrink-0 fill-primary text-primary-foreground"
                                            aria-hidden="true"
                                        />
                                    </span>
                                    <p className="pb-8 text-base leading-7 text-card-foreground md:text-lg md:leading-8">
                                        {item.label}
                                    </p>
                                </li>
                            ))}
                        </ol>
                        <p className="mt-2 text-right text-xs text-muted-foreground">
                            เลข Ticket: {ticket.ticket_number}
                        </p>
                    </>
                )}
            </div>
            <p className="mt-5 text-center text-xs text-muted-foreground">
                ข้อมูลนี้แสดงเฉพาะเลข Ticket และสถานะ โดยไม่เปิดเผยรายละเอียดที่ผู้แจ้งส่งมา
            </p>
        </section>
    );
}

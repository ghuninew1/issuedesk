import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    ArrowRight,
    ClipboardCheck,
    LifeBuoy,
    Search,
    TicketPlus,
    ClipboardPaste,
} from "lucide-react";
import { cx } from "../utils/cx";
import ElectricBorder from "../components/ElectricBorder";
import Header from "../components/layout/Header";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const PortalHome = () => {
    const [ticketNumber, setTicketNumber] = useState("");
    const navigate = useNavigate();

    useDocumentTitle("Home");

    const handleTrackTicket = (event) => {
        event.preventDefault();

        const value = ticketNumber.trim();

        if (!value) {
            return;
        }

        navigate(`/track/${encodeURIComponent(value)}`);
    };

    const handlePaste = async () => {
        try {
            const text = await navigator.clipboard.readText();

            if (text) {
                setTicketNumber(text.trim());
            }
        } catch {
            // แจ้งเตือนหากไม่สามารถเข้าถึง Clipboard ได้
        }
    };

    return (
        <main className="min-h-screen relative overflow-hidden selection:bg-cyan-500 selection:text-white">
            {/* Background Animated Gradient Blobs */}
            <div className="absolute top-1/4 -left-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse delay-1000 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Header */}
            <Header isSidebarCollapsed={false} onToggleSidebar={() => {}} onOpenMobileSidebar={() => {}} />

            {/* Main */}
            <section className="mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pt-20">
                <div className="mx-auto max-w-2xl text-center animate-fadeInDown">
                    <span
                        className={cx(
                            "inline-flex items-center gap-2 rounded-full",
                            "border border-border bg-muted/50 px-3 py-1.5",
                            "text-xs font-medium text-muted-foreground",
                            "animate-bounce animate-infinite transition-all",
                        )}
                    >
                        <span className="size-2 rounded-full bg-emerald-500" />
                        IT Help Desk
                    </span>

                    <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-5xl">
                        แจ้งปัญหาที่คุณเจอ
                        <span className="mt-6 block text-muted-foreground">ได้ที่นี่</span>
                    </h1>

                    <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
                        แจ้งปัญหาการใช้งาน หรือติดตามความคืบหน้าของทิกเก็ต ได้ง่าย ๆ ในที่เดียว
                    </p>
                </div>
                {/* Cards Left */}
                <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2 md:gap-6">
                    <ElectricBorder
                        color="#4c00b0"
                        speed={1}
                        chaos={0.5}
                        spread={0.6}
                        strands={1.5}
                        thickness={2}
                        borderRadius={30}
                        className="animate-fadeInLeft"
                    >
                        <article
                            className={cx(
                                "flex flex-col rounded-2xl border border-border h-full",
                                "bg-card p-6 shadow-sm sm:p-8",
                                "transition-colors hover:border-primary/40",
                            )}
                        >
                            <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                <TicketPlus size={25} aria-hidden="true" />
                            </div>

                            <h2 className="mt-6 text-xl font-semibold tracking-tight">แจ้งปัญหา IT</h2>

                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                คอมพิวเตอร์มีปัญหา โปรแกรมใช้งานไม่ได้ เชื่อมต่อเครือข่ายไม่ได้ หรือปัญหาอื่นๆ
                                แจ้งรายละเอียดให้ ช่วยตรวจสอบได้เลย
                            </p>

                            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
                                <li className="flex items-center gap-2">
                                    <ClipboardCheck size={17} className="shrink-0" aria-hidden="true" />
                                    ระบุปัญหาและรายละเอียดที่พบ
                                </li>
                                <li className="flex items-center gap-2">
                                    <ClipboardCheck size={17} className="shrink-0" aria-hidden="true" />
                                    แนบภาพประกอบได้
                                </li>
                            </ul>

                            <Link
                                to="/report"
                                title="แจ้งปัญหาใหม่"
                                className={cx(
                                    "mt-8 inline-flex min-h-11 w-full items-center",
                                    "justify-center gap-2 rounded-lg px-4 py-3",
                                    "bg-primary text-sm font-medium text-primary-foreground",
                                    "transition-opacity hover:opacity-90 hover:bg-primary/90 hover:text-primary-foreground/90",
                                    "focus-visible:outline-none focus-visible:ring-2",
                                    "focus-visible:ring-ring focus-visible:ring-offset-2",
                                )}
                            >
                                แจ้งปัญหาใหม่
                                <ArrowRight size={17} aria-hidden="true" className="animate-bounceRight" />
                            </Link>
                        </article>
                    </ElectricBorder>

                    {/* Cards Right */}
                    <ElectricBorder
                        color="#bc2ed6"
                        speed={1}
                        chaos={0.5}
                        spread={0.6}
                        strands={1.5}
                        thickness={2}
                        borderRadius={24}
                        className="animate-fadeInRight"
                    >
                        <article
                            className={cx(
                                "flex flex-col rounded-2xl border border-border",
                                "bg-card p-6 shadow-sm sm:p-8",
                                "transition-colors hover:border-primary/40",
                            )}
                        >
                            <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-foreground">
                                <Search size={25} aria-hidden="true" />
                            </div>

                            <h2 className="mt-6 text-xl font-semibold tracking-tight">ติดตามทิกเก็ต</h2>

                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                                แจ้งปัญหาไปแล้วใช่ไหม? กรอกเลขทิกเก็ตเพื่อตรวจสอบสถานะล่าสุด
                            </p>

                            <form onSubmit={handleTrackTicket} className="mt-6">
                                <label htmlFor="ticket-number" className="mb-2 block text-sm font-medium">
                                    เลขทิกเก็ต (Ticket Number)
                                </label>
                                <div className="relative">
                                    <input
                                        id="ticket-number"
                                        type="text"
                                        value={ticketNumber}
                                        onChange={(event) => setTicketNumber(event.target.value)}
                                        placeholder="เช่น IT-202610-0001"
                                        autoComplete="off"
                                        required
                                        className={cx(
                                            "h-11 w-full rounded-lg border border-input",
                                            "bg-background px-3 text-sm",
                                            "placeholder:text-muted-foreground",
                                            "focus-visible:outline-none focus-visible:ring-2",
                                            "focus-visible:ring-ring",
                                        )}
                                    />

                                    <p className="mt-2 text-xs text-muted-foreground">
                                        เลขทิกเก็ตที่ได้รับหลังแจ้งปัญหา
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handlePaste}
                                        title="Paste from clipboard"
                                        className="absolute right-2 top-2 -translate-y-1 p-2 cursor-pointer hover:opacity-70"
                                    >
                                        <ClipboardPaste size={17} aria-hidden="true" />
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!ticketNumber.trim()}
                                    className={cx(
                                        "mt-4 inline-flex min-h-11 w-full items-center",
                                        "justify-center gap-2 rounded-lg border border-input cursor-pointer",
                                        "bg-background px-4 py-3 text-sm font-medium",
                                        "transition-colors hover:bg-muted hover:text-foreground hover:opacity-90",
                                        "focus-visible:outline-none focus-visible:ring-2",
                                        "focus-visible:ring-ring",
                                        "disabled:cursor-not-allowed disabled:opacity-50",
                                    )}
                                >
                                    ตรวจสอบสถานะ
                                    <ArrowRight size={17} aria-hidden="true" className={cx(ticketNumber && "animate-bounceRight")} />
                                </button>
                            </form>
                        </article>
                    </ElectricBorder>
                </div>
                {/* Callout */}
                <div className="mx-auto mt-10 flex max-w-4xl items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:p-5 animate-fadeInUp">
                    <LifeBuoy size={20} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div>
                        <p className="text-sm font-medium">ไม่แน่ใจว่าต้องทำอย่างไร?</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            หากพบปัญหา ให้เลือกแจ้งปัญหา IT แต่ถ้าเคยแจ้งไปแล้ว ให้ใช้เลขทิกเก็ตเพื่อติดตามสถานะ
                        </p>
                    </div>
                </div>

                <footer className="mt-14 border-t border-border pt-6 text-center text-xs text-muted-foreground animate-fadeInUp">
                    IssueDesk · © 2026 GhuniNew. All rights reserved.
                </footer>
            </section>
        </main>
    );
};

export default PortalHome;

import GlassButton from "../components/GlassButton";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardCheck, LifeBuoy, Search, TicketPlus, ClipboardPaste } from "lucide-react";
import { cx } from "../utils/cx";
import ElectricBorder from "../components/ElectricBorder";
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
        <section className="relative isolate mx-auto max-w-6xl overflow-hidden px-5 pb-16 pt-12 md:px-8 md:pt-20">
            <div className="pointer-events-none absolute left-1/2 top-10 -z-10 size-[34rem] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[110px] dark:bg-cyan-400/5" />
            <div className="mx-auto max-w-2xl text-center animate-fadeInDown">
                <span
                    className={cx(
                        "inline-flex items-center gap-2 rounded-full",
                        "glass-surface border-white/70 bg-white/55 px-3 py-1.5 dark:border-white/10 dark:bg-white/5",
                        "text-xs font-medium text-muted-foreground",
                        "animate-bounceUp-15 transition-all",
                    )}
                >
                    <span className="size-2 rounded-full bg-emerald-500" />
                    IT Help Desk
                </span>

                <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-5xl">
                    แจ้งปัญหาที่คุณเจอ
                    <span className="mt-2 block bg-gradient-to-r from-cyan-700 via-sky-600 to-indigo-600 bg-clip-text text-transparent dark:from-cyan-300 dark:via-sky-300 dark:to-indigo-300">ได้ที่นี่</span>
                </h1>

                <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-muted-foreground md:text-base">
                    แจ้งปัญหาการใช้งาน หรือติดตามความคืบหน้าของทิกเก็ต ได้ง่าย ๆ ในที่เดียว
                </p>
            </div>
            {/* Cards Left */}
            <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2 md:gap-6">
                <ElectricBorder
                    color="#4c00b0"
                    speed={1.2}
                    chaos={0.7}
                    spread={0.4}
                    strands={0.3}
                    thickness={1.2}
                    borderRadius={24}
                    className="animate-fadeInLeft"
                >
                    <article
                        className={cx(
                            "glass-surface flex h-full flex-col rounded-2xl border-white/70 bg-white/45 p-6 dark:border-white/10 dark:bg-slate-900/45 md:p-8",
                            "transition-all hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-[0_20px_55px_rgba(34,120,150,.14)] duration-300 ease-in-out",
                        )}
                    >
                        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-indigo-600 text-white shadow-lg shadow-cyan-900/15 dark:from-cyan-400 dark:to-indigo-400 dark:text-slate-950">
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
                                "portal-home-blue-action bg-slate-900 text-sm font-medium text-white shadow-lg shadow-cyan-900/10 dark:bg-cyan-500 dark:text-slate-950",
                                "transition-all hover:-translate-y-0.5 hover:bg-cyan-800 hover:text-white dark:hover:bg-cyan-400 dark:hover:text-slate-950",
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
                    speed={1.2}
                    chaos={0.7}
                    spread={0.4}
                    strands={0.3}
                    thickness={1.2}
                    borderRadius={24}
                    className="animate-fadeInRight"
                >
                    <article
                        className={cx(
                            "glass-surface flex flex-col rounded-2xl border-white/70 bg-white/45 p-6 dark:border-white/10 dark:bg-slate-900/45 md:p-8",
                            "transition-all hover:-translate-y-1 hover:border-fuchsia-400/40 hover:shadow-[0_20px_55px_rgba(100,70,150,.14)]",
                        )}
                    >
                        <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-lg shadow-fuchsia-900/15 dark:from-fuchsia-400 dark:to-indigo-400 dark:text-slate-950">
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
                                        "bg-white/60 px-3 text-sm backdrop-blur-xl dark:bg-white/5",
                                        "placeholder:text-muted-foreground",
                                        "focus-visible:outline-none focus-visible:ring-2",
                                        "focus-visible:ring-ring",
                                    )}
                                />

                                <p className="mt-2 text-xs text-muted-foreground">เลขทิกเก็ตที่ได้รับหลังแจ้งปัญหา</p>
                                <GlassButton
                                    type="button"
                                    onClick={handlePaste}
                                    title="Paste from clipboard"
                                    className={cx("absolute right-2 top-2 -translate-y-1 p-2 cursor-pointer hover:opacity-70")}
                                >
                                    <ClipboardPaste size={17} aria-hidden="true" />
                                </GlassButton>
                            </div>

                            <GlassButton
                                type="submit"
                                disabled={!ticketNumber.trim()}
                                className={cx(
                                    "mt-4 inline-flex min-h-11 w-full items-center",
                                    "justify-center gap-2 rounded-lg border border-input cursor-pointer",
                                    "bg-background px-4 py-3 text-sm font-medium",
                                    "transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)] hover:text-foreground hover:opacity-90",
                                    "focus-visible:outline-none focus-visible:ring-2",
                                    "focus-visible:ring-ring",
                                    "disabled:cursor-not-allowed disabled:opacity-50",
                                )}
                            >
                                ตรวจสอบสถานะ
                                <ArrowRight
                                    size={17}
                                    aria-hidden="true"
                                    className={cx(ticketNumber && "animate-bounceRight")}
                                />
                            </GlassButton>
                        </form>
                    </article>
                </ElectricBorder>
            </div>
            {/* Callout */}
            <div className="glass-surface mx-auto mt-10 flex max-w-4xl items-start gap-3 rounded-2xl border-white/70 bg-white/45 p-4 dark:border-white/10 dark:bg-slate-900/40 md:p-5 animate-fadeInUp">
                <LifeBuoy size={20} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                    <p className="text-sm font-medium">ไม่แน่ใจว่าต้องทำอย่างไร?</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        หากพบปัญหา ให้เลือกแจ้งปัญหา IT แต่ถ้าเคยแจ้งไปแล้ว ให้ใช้เลขทิกเก็ตเพื่อติดตามสถานะ
                    </p>
                </div>
            </div>
        </section>
    );
};

export default PortalHome;

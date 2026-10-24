import ReportForm from "../components/report/ReportForm";
import { cx } from "../utils/cx";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const ReportIssue = () => {
    useDocumentTitle("Report Issue");
    return (
        <div className="relative mx-auto max-w-6xl animate-fadeInUp">
            <div className="pointer-events-none absolute -right-20 -top-16 -z-10 size-80 rounded-full bg-cyan-400/10 blur-[100px] dark:bg-cyan-400/5" />
            <div className="mb-6">
                <p className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/55 px-3 py-1.5 text-xs font-medium text-cyan-800 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5 dark:text-cyan-200">IT Support</p>

                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Report an Issue</h2>

                <p className="mt-2 text-sm text-muted-foreground">
                    แจ้งปัญหาคอมพิวเตอร์ เครือข่าย เครื่องพิมพ์ หรือซอฟต์แวร์
                </p>
            </div>

            <div className={cx("glass-surface rounded-[1.75rem] border-white/70 bg-gradient-to-br from-white/70 via-white/50 to-cyan-50/35 p-5 dark:border-white/10 dark:from-slate-900/75 dark:via-slate-900/55 dark:to-cyan-950/20", "md:p-6 lg:p-8")}>
                <ReportForm />
            </div>
        </div>
    );
};

export default ReportIssue;

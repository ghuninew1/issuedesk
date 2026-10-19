import ReportForm from "../components/report/ReportForm";
import { cx } from "../utils/cx";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const ReportIssue = () => {
    useDocumentTitle("Report Issue");
    return (
        <div className="mx-auto max-w-4xl animate-fadeInUp">
            <div className="mb-6">
                <p className="text-sm font-medium text-primary">IT Support</p>

                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Report an Issue</h2>

                <p className="mt-2 text-sm text-muted-foreground">
                    แจ้งปัญหาคอมพิวเตอร์ เครือข่าย เครื่องพิมพ์ หรือซอฟต์แวร์
                </p>
            </div>

            <div className={cx("rounded-xl border border-border bg-card p-5 shadow-sm", "sm:p-6 lg:p-8")}>
                <ReportForm />
            </div>
        </div>
    );
};

export default ReportIssue;

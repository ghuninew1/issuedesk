import { NavLink } from "react-router-dom";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { QrCode } from "lucide-react";
import { cx } from "../../utils/cx";
export default function QRWorkspace({ children }) {
    useDocumentTitle("QR Code Studio");
    return (
        <div className={cx("mx-auto max-w-7xl")}>
            <header className={cx("mb-6")}>
                <div
                    className={cx(
                        "mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-600 dark:text-cyan-400",
                    )}
                >
                    <QrCode size={16} /> IssueDesk tools · V1
                </div>
                <h1 className={cx("text-3xl font-semibold tracking-tight")}>QR Code Studio</h1>
                <p className={cx("mt-2 text-sm text-muted-foreground")}>Create a code. Connect your world.</p>
            </header>
            <nav
                aria-label="QR Studio navigation"
                className={cx("glass-surface mb-6 flex flex-wrap gap-1 rounded-2xl p-1.5")}
            >
                {[
                    ["/qr-studio", "Create QR"],
                    ["/qr-studio/links", "Short Links"],
                    ["/qr-studio/saved", "My QR Codes"],
                ].map(([to, label]) => (
                    <NavLink
                        key={to}
                        to={to}
                        end
                        className={({ isActive }) =>
                            cx(
                                "rounded-xl px-4 py-2.5 text-sm transition-colors",
                                isActive
                                    ? "bg-cyan-600 text-white shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )
                        }
                    >
                        {label}
                    </NavLink>
                ))}
            </nav>
            {children}
        </div>
    );
}

import { cx } from "../../utils/cx";
import GlassButton from "../GlassButton";

function getLogIcon(type) {
    const icons = {
        info: "•",
        success: "✓",
        error: "✕",
        warning: "!",
    };

    return icons[type] || icons.info;
}

function ConversionLog({ logs, onClear }) {
    if (logs.length === 0) {
        return null;
    }

    return (
        <section className={cx("glass-surface mt-6 rounded-2xl p-5 md:p-6")}>
            <div className={cx("mb-4 flex items-center justify-between gap-3")}>
                <h2 className={cx("font-semibold text-lg")}>Conversion Log</h2>

                <GlassButton
                    type="button"
                    onClick={onClear}
                    className={cx("rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground")}
                >
                    Clear
                </GlassButton>
            </div>

            <div className={cx("max-h-64 space-y-2 overflow-y-auto")}>
                {logs.map((log) => (
                    <div
                        key={log.id}
                        className={cx("flex items-start gap-3 rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm")}
                    >
                        <span
                            className={cx(
                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                log.type === "info" && "bg-primary/10 text-primary",
                                log.type === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                log.type === "error" && "bg-destructive/10 text-destructive",
                                log.type === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                            )}
                        >
                            {getLogIcon(log.type)}
                        </span>

                        <span className={cx("min-w-0 break-words text-muted-foreground")}>
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default ConversionLog;

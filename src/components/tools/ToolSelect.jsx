import { cx } from "../../utils/cx";

export default function ToolSelect({ className, ...props }) {
    return (
        <select
            {...props}
            className={cx(
                "rounded-xl border border-input bg-background/60 px-3 py-2.5 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
        />
    );
}

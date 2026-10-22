import { cx } from "../../utils/cx";

const StatCard = ({ title, value, description, icon, accent }) => {
    return (
        <article
            className={cx(
                "glass-surface relative overflow-hidden rounded-xl p-5",
                "border border-border/70",
                "shadow-sm transition-[border-color,box-shadow] duration-200",
                "hover:border-border hover:shadow-md",
                "motion-reduce:transition-none",
                "animate-fadeInUp",
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>

                    <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
                </div>

                <div className={cx("flex size-11 shrink-0 items-center justify-center rounded-xl", accent)}>{icon}</div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">{description}</p>
        </article>
    );
};

export default StatCard;

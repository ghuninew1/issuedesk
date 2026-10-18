import { cx } from '../../utils/cx'

const StatCard = ({ title, value, description, icon, accent }) => {
    return (
        <article
            className={cx(
                'rounded-xl border border-border bg-card p-5 animate-fadeInUp',
                'shadow-sm transition-shadow hover:shadow-md',
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground">
                        {title}
                    </p>

                    <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {value}
                    </p>
                </div>

                <div
                    className={cx(
                        'flex size-11 shrink-0 items-center justify-center rounded-lg',
                        accent,
                    )}
                >
                    {icon}
                </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
                {description}
            </p>
        </article>
    )
}

export default StatCard
import { useEffect, useState } from 'react'
import { cx } from '../../utils/cx'
import { Link } from 'react-router-dom'
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

const priorityStyles = {
    High: 'bg-red-500/10 text-red-600 dark:text-red-400',
    Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    Low: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}

const statusStyles = {
    Open: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    'In Progress': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    Resolved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

const formatDate = (value) => {
    if (!value) {
        return '—'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return '—'
    }

    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Bangkok',
    }).format(date)
}


const Badge = ({ children, className }) => (
    <span
        className={cx(
            'inline-flex items-center rounded-full px-2.5 py-1',
            'text-xs font-medium whitespace-nowrap',
            className,
        )}
    >
        {children}
    </span>
)

const AttachmentCount = ({ count }) => {
    if (!Number.isInteger(count) || count === 0) {
        return <span className="text-muted-foreground">0</span>;
    }

    return (
        <span className="text-sm text-muted-foreground" aria-label={`${count} attachments`}>
            {count}
        </span>
    );
};

const RecentIssues = () => {
    const [issues, setIssues] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    useDocumentTitle('Dashboard');

    useEffect(() => {
        const controller = new AbortController()

        const fetchIssues = async () => {
            try {
                const response = await fetch('/api/issues?limit=20', {
                    signal: controller.signal,
                })

                const data = await response.json()

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message || 'Failed to fetch issues',
                    )
                }

                setIssues(data.issues)
            } catch (error) {
                if (error.name === 'AbortError') {
                    return
                }

                console.error('Failed to fetch issues:', error)
                setError('ไม่สามารถโหลดรายการ Issue ได้')
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        fetchIssues()

        return () => controller.abort()
    }, [])


    return (
        <section
            aria-labelledby="recent-issues-heading"
            className={cx(
                "glass-surface mt-6 overflow-hidden rounded-xl",
                "border border-border/70 shadow-sm",
                "animate-fadeInUp",
            )}
        >
            {/* Header */}
            <div
                className={cx(
                    "flex flex-col gap-3 p-5",
                    "md:flex-row md:items-center md:justify-between",
                    "border-b border-border",
                )}
            >
                <div>
                    <h3 id="recent-issues-heading" className="text-base font-semibold">
                        Recent Issues
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">Latest reported IT issues</p>
                </div>

                <span className="text-sm text-muted-foreground">{issues.length} issues</span>
            </div>

            {isLoading && (
                <div role="status" className="p-8 text-center text-sm text-muted-foreground">
                    กำลังโหลดรายการ Issue...
                </div>
            )}

            {error && (
                <div role="alert" className="p-8 text-center text-sm text-destructive">
                    {error}
                </div>
            )}

            {!isLoading && !error && issues.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีรายการ Issue</div>
            )}

            {/* Desktop table */}
            {!isLoading && !error && issues.length > 0 && (
                <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted/30 text-xs text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Issue
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Reporter
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Category
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Priority
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Status
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Attachments
                                </th>
                                <th scope="col" className="px-5 py-3 font-medium">
                                    Reported
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border">
                            {issues.map((issue) => (
                                <tr key={issue.id} className={cx("relative transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)]")}>
                                    <td className="px-5 py-4">
                                        <Link
                                            to={`/issues/${encodeURIComponent(issue.ticket_number)}`}
                                            className={cx(
                                                "font-medium",
                                                "after:absolute after:inset-0",
                                                "focus-visible:outline-none focus-visible:ring-2",
                                                "focus-visible:ring-inset focus-visible:ring-ring/50",
                                            )}
                                        >
                                            {issue.title}
                                        </Link>

                                        <p className="mt-1 text-xs text-muted-foreground">{issue.ticket_number}</p>
                                    </td>

                                    <td className="px-5 py-4 whitespace-nowrap">{issue.reporter_name}</td>

                                    <td className="px-5 py-4">{issue.category}</td>

                                    <td className="px-5 py-4">
                                        <Badge className={priorityStyles[issue.priority]}>{issue.priority}</Badge>
                                    </td>

                                    <td className="px-5 py-4">
                                        <Badge className={statusStyles[issue.status]}>{issue.status}</Badge>
                                    </td>

                                    <td className="px-5 py-4">
                                        <AttachmentCount count={issue.attachment_count} />
                                    </td>

                                    <td className="px-5 py-4 whitespace-nowrap text-muted-foreground">
                                        {formatDate(issue.created_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Mobile cards */}
            {!isLoading && !error && issues.length > 0 && (
                <div className="divide-y divide-border md:hidden">
                    {issues.map((issue) => (
                        <article
                            key={issue.id}
                            className={cx("relative space-y-4 p-4", "transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)]")}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs text-muted-foreground">{issue.ticket_number}</p>

                                    <h4 className="mt-1 font-medium">
                                        <Link
                                            to={`/issues/${encodeURIComponent(issue.ticket_number)}`}
                                            className={cx(
                                                "after:absolute after:inset-0",
                                                "focus-visible:outline-none focus-visible:ring-2",
                                                "focus-visible:ring-inset focus-visible:ring-ring/50",
                                            )}
                                        >
                                            {issue.title}
                                        </Link>
                                    </h4>
                                </div>

                                <Badge className={priorityStyles[issue.priority]}>{issue.priority}</Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-xs text-muted-foreground">Reporter</p>
                                    <p className="mt-1">{issue.reporter_name}</p>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground">Category</p>
                                    <p className="mt-1">{issue.category}</p>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground">Status</p>
                                    <div className="mt-1">
                                        <Badge className={statusStyles[issue.status]}>{issue.status}</Badge>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-muted-foreground">Attachments</p>
                                    <div className="mt-1">
                                        <AttachmentCount count={issue.attachment_count} />
                                    </div>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">Reported {formatDate(issue.created_at)}</p>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );

}

export default RecentIssues
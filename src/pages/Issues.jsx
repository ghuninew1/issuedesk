import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getIssues } from '../services/issues'
import { cx } from '../utils/cx'
import { RefreshCw, Loader } from "lucide-react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const statusFilters = [
    { label: "All Issues", value: "All" },
    { label: "Open", value: "Open" },
    { label: "In Progress", value: "In Progress" },
    { label: "Resolved", value: "Resolved" },
    { label: "High Priority", value: "High" },
    { label: "Medium Priority", value: "Medium" },
    { label: "Low Priority", value: "Low" },
];

const statusStyles = {
    Open: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    'In Progress':
        'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    Resolved:
        'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
}

const formatDate = (date) => {
    if (!date) {
        return '—'
    }

    const parsedDate = new Date(date)

    if (Number.isNaN(parsedDate.getTime())) {
        return '—'
    }

    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(parsedDate)
}

const StatusBadge = ({ status }) => (
    <span
        className={cx(
            'inline-flex whitespace-nowrap rounded-full px-2.5 py-1',
            'text-xs font-medium',
            statusStyles[status] || 'bg-muted text-muted-foreground',
        )}
    >
        {status}
    </span>
)

const Issues = () => {
    const [issues, setIssues] = useState([])
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('All')
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const activeControllerRef = useRef(null)
    const isRequestInProgressRef = useRef(false)

    useDocumentTitle('Issues');

    const fetchIssues = useCallback(async ({ controller, isInitialLoad = false } = {}) => {
        if (isRequestInProgressRef.current) {
            return
        }

        const requestController = controller || new AbortController()

        isRequestInProgressRef.current = true
        activeControllerRef.current = requestController

        if (!isInitialLoad) {
            setIsLoading(true)
            setError('')
        }

        try {
            const data = await getIssues({
                limit: 100,
                signal: requestController.signal,
            })

            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch issues')
            }

            setIssues(data.issues)
            setError('')
        } catch (requestError) {
            if (requestError.name === 'AbortError') {
                return
            }

            setError('Unable to load issues. Please try again.')
        } finally {
            if (activeControllerRef.current === requestController) {
                activeControllerRef.current = null
                isRequestInProgressRef.current = false

                if (!requestController.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()

        const timeoutId = setTimeout(() => {
            fetchIssues({
                controller,
                isInitialLoad: true,
            })
        }, 0)

        return () => {
            clearTimeout(timeoutId)
            controller.abort()

            if (activeControllerRef.current === controller) {
                activeControllerRef.current = null
                isRequestInProgressRef.current = false
            }
        }
    }, [fetchIssues])

    const handleRefresh = () => {
        fetchIssues({
            controller: new AbortController(),
        })
    }

    const filteredIssues = issues.filter((issue) => {
        const searchTerm = search.trim().toLowerCase()

        const matchesSearch =
            issue.ticket_number.toLowerCase().includes(searchTerm) ||
            issue.title.toLowerCase().includes(searchTerm)

        const matchesStatus =
            status === 'All' || issue.status === status || issue.priority === status

        return matchesSearch && matchesStatus
    })

    return (
        <div className="mx-auto max-w-7xl animate-fadeInUp">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">All Issues</h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                        View, search, and track all reported IT issues.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className={cx(
                        "inline-flex items-center justify-center gap-2",
                        "rounded-full border border-input p-3",
                        "transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)] cursor-pointer",
                        "focus-visible:outline-none focus-visible:ring-2",
                        "focus-visible:ring-ring/20",
                        "disabled:pointer-events-none disabled:opacity-50",
                    )}
                >
                    <span aria-hidden="true" className={cx(isLoading && "animate-spin")}>
                        {isLoading ? <Loader /> : <RefreshCw />}
                    </span>
                </button>
            </div>

            <div className="mb-6 flex flex-col gap-4 md:flex-row">
                <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search ticket number or title..."
                    aria-label="Search issues"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 md:max-w-sm"
                />

                <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    aria-label="Filter issues by status"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 md:w-48"
                >
                    {statusFilters.map((filter) => (
                        <option key={filter.value} value={filter.value}>
                            {filter.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="mb-4 text-sm text-muted-foreground" aria-live="polite">
                {isLoading
                    ? "Loading issues..."
                    : error
                      ? error
                      : `Showing ${filteredIssues.length} of ${issues.length} issues`}
            </div>

            {error ? (
                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm text-destructive">{error}</p>

                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className={cx(
                            "mt-3 inline-flex h-9 items-center justify-center",
                            "rounded-lg border border-input px-3 text-sm font-medium",
                            "transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)]",
                            "focus-visible:outline-none focus-visible:ring-2",
                            "focus-visible:ring-ring/20",
                            "disabled:pointer-events-none disabled:opacity-50",
                        )}
                    >
                        Try again
                    </button>
                </div>
            ) : isLoading ? (
                <div
                    className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
                    role="status"
                >
                    Loading issues...
                </div>
            ) : filteredIssues.length === 0 ? (
                <div className="rounded-xl border border-border p-8 text-center">
                    <h3 className="font-medium">No issues found</h3>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {issues.length === 0
                            ? "No issues have been reported yet."
                            : "Try changing your search or status filter."}
                    </p>
                </div>
            ) : (
                <>
                    <div className="glass-surface hidden overflow-hidden rounded-xl md:block">
                        <div className="overflow-x-auto">
                            <table className="glass-table w-full text-left text-sm">
                                <thead className="text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Ticket Number</th>
                                        <th className="px-4 py-3 font-medium">Issue</th>
                                        <th className="px-4 py-3 font-medium">Reporter</th>
                                        <th className="px-4 py-3 font-medium">Category</th>
                                        <th className="px-4 py-3 font-medium">Priority</th>
                                        <th className="px-4 py-3 font-medium">Status</th>
                                        <th className="px-4 py-3 font-medium">Reported</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filteredIssues.map((issue) => (
                                        <tr
                                            key={issue.id}
                                            className={cx("relative transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)]")}
                                        >
                                            <td className="whitespace-nowrap px-4 py-4 font-medium">
                                                <Link
                                                    to={`/issues/${encodeURIComponent(issue.ticket_number)}`}
                                                    className={cx(
                                                        "after:absolute after:inset-0",
                                                        "focus-visible:outline-none focus-visible:ring-2",
                                                        "focus-visible:ring-inset focus-visible:ring-ring/50",
                                                    )}
                                                >
                                                    {issue.ticket_number}
                                                </Link>
                                            </td>

                                            <td className="max-w-64 px-4 py-4">
                                                <p className="truncate font-medium">{issue.title}</p>
                                            </td>

                                            <td className="max-w-40 truncate px-4 py-4 text-muted-foreground">
                                                {issue.reporter_name}
                                            </td>

                                            <td className="whitespace-nowrap px-4 py-4">{issue.category}</td>

                                            <td className="whitespace-nowrap px-4 py-4">{issue.priority}</td>

                                            <td className="whitespace-nowrap px-4 py-4">
                                                <StatusBadge status={issue.status} />
                                            </td>

                                            <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                                                {formatDate(issue.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-3 md:hidden">
                        {filteredIssues.map((issue) => (
                            <article
                                key={issue.id}
                                className={cx(
                                    "relative rounded-xl border border-border p-4",
                                    "transition-colors hover:bg-[var(--glass-surface-hover)] hover:shadow-[inset_0_1px_0_var(--glass-highlight)]",
                                )}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-muted-foreground">
                                            <Link
                                                to={`/issues/${encodeURIComponent(issue.ticket_number)}`}
                                                className={cx(
                                                    "after:absolute after:inset-0",
                                                    "focus-visible:outline-none focus-visible:ring-2",
                                                    "focus-visible:ring-inset focus-visible:ring-ring/50",
                                                )}
                                            >
                                                {issue.ticket_number}
                                            </Link>
                                        </p>

                                        <h3 className="mt-1 break-words font-medium">{issue.title}</h3>
                                    </div>

                                    <StatusBadge status={issue.status} />
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Reporter</p>
                                        <p className="mt-1 break-words">{issue.reporter_name}</p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground">Category</p>
                                        <p className="mt-1">{issue.category}</p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground">Priority</p>
                                        <p className="mt-1">{issue.priority}</p>
                                    </div>

                                    <div>
                                        <p className="text-xs text-muted-foreground">Reported</p>
                                        <p className="mt-1">{formatDate(issue.created_at)}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default Issues

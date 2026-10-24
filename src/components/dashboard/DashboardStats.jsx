import { useEffect, useState } from 'react'
import StatCard from './StatCard'
import { cx } from '../../utils/cx'
import { getIssueStats } from '../../services/issues'
import { useDocumentTitle } from "../../hooks/useDocumentTitle";

const DashboardStats = () => {
    const [statsData, setStatsData] = useState({
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
    })
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(false)

    useDocumentTitle('Dashboard');

    useEffect(() => {
        const controller = new AbortController()

        const fetchStats = async () => {
            try {
                const data = await getIssueStats()

                if (!data.success) {
                    throw new Error(
                        data.message || 'Failed to fetch issue statistics',
                    )
                }

                setStatsData(data.stats)
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    return
                }

                console.error('Failed to fetch issue stats:', error)
                setError(true)
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        fetchStats()

        return () => controller.abort()
    }, [])

    const stats = [
        {
            id: 'total',
            title: 'Total Issues',
            value: statsData.total,
            description: 'All reported issues',
            accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="size-5"
                    aria-hidden="true"
                >
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 8h8M8 12h8M8 16h5"
                    />
                </svg>
            ),
        },
        {
            id: 'open',
            title: 'Open Issues',
            value: statsData.open,
            description: 'Waiting for attention',
            accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="size-5"
                    aria-hidden="true"
                >
                    <circle cx="12" cy="12" r="9" />
                    <path
                        strokeLinecap="round"
                        d="M12 7v5l3 2"
                    />
                </svg>
            ),
        },
        {
            id: 'progress',
            title: 'In Progress',
            value: statsData.inProgress,
            description: 'Currently being handled',
            accent: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="size-5"
                    aria-hidden="true"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 3v3m0 12v3M3 12h3m12 0h3M5.64 5.64l2.12 2.12m8.48 8.48 2.12 2.12m0-12.72-2.12 2.12m-8.48 8.48-2.12 2.12"
                    />
                    <circle cx="12" cy="12" r="4" />
                </svg>
            ),
        },
        {
            id: 'resolved',
            title: 'Resolved',
            value: statsData.resolved,
            description: 'Successfully resolved',
            accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            icon: (
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="size-5"
                    aria-hidden="true"
                >
                    <circle cx="12" cy="12" r="9" />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8 12 2.5 2.5L16 9"
                    />
                </svg>
            ),
        },
    ]

    return (
        <section aria-label="Issue statistics" className="animate-fadeInDown">
            {error ? (
                <p
                    role="alert"
                    className="py-6 text-center text-sm text-destructive"
                >
                    ไม่สามารถโหลดสถิติ Issue ได้
                </p>
            ) : (
                <div
                    className={cx(
                        'grid grid-cols-1 gap-4',
                        'md:grid-cols-2',
                        'lg:grid-cols-4',
                    )}
                    aria-busy={isLoading}
                >
                    {stats.map((stat) => (
                        <StatCard
                            key={stat.id}
                            {...stat}
                            value={isLoading ? '—' : stat.value}
                        />
                    ))}
                </div>
            )}
        </section>
    )
}

export default DashboardStats
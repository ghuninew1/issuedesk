import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    deleteIssue,
    getIssue,
    getIssueAttachmentUrl,
    getIssueAttachments,
    updateIssueStatus,
} from "../services/issues";
import { cx } from "../utils/cx";
import heic2any from "heic2any";
import { Download, Copy, Check, Trash2, Loader } from "lucide-react";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const statusStyles = {
    Open: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    "In Progress": "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    Resolved: "bg-green-500/10 text-green-700 dark:text-green-400",
};

const priorityStyles = {
    Low: "bg-muted text-muted-foreground",
    Medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    High: "bg-red-500/10 text-red-700 dark:text-red-400",
};

const formatDate = (date) => {
    if (!date) {
        return "—";
    }

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(parsedDate);
};

const DetailField = ({ label, children }) => (
    <div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="mt-1 break-words text-sm font-medium">{children || "—"}</dd>
    </div>
);

const Badge = ({ children, className }) => (
    <span className={cx("inline-flex whitespace-nowrap rounded-full px-2.5 py-1", "text-xs font-medium", className)}>
        {children}
    </span>
);

const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "Unknown size";
    }

    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentImagePreview = ({ attachment, previewUrl }) => {
    const [preview, setPreview] = useState({
        key: "",
        url: "",
        error: false,
    });

    const isHeic =
        /\.(heic|heif)$/i.test(attachment.file_name) ||
        ["image/heic", "image/heif"].includes(attachment.mime_type?.toLowerCase());

    useEffect(() => {
        if (!isHeic) {
            return;
        }

        let cancelled = false;
        let objectUrl = "";

        const createPreview = async () => {
            try {
                const response = await fetch(previewUrl);

                if (!response.ok) {
                    throw new Error("Failed to load attachment");
                }

                const blob = await response.blob();

                const converted = await heic2any({
                    blob,
                    toType: "image/jpeg",
                    quality: 0.85,
                });

                const jpegBlob = Array.isArray(converted) ? converted[0] : converted;

                if (cancelled) {
                    return;
                }

                objectUrl = URL.createObjectURL(jpegBlob);

                setPreview({
                    key: previewUrl,
                    url: objectUrl,
                    error: false,
                });
            } catch (error) {
                if (!cancelled) {
                    console.error("Failed to preview attachment:", error);

                    setPreview({
                        key: previewUrl,
                        url: "",
                        error: true,
                    });
                }
            }
        };

        createPreview();

        return () => {
            cancelled = true;

            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [isHeic, previewUrl]);

    if (!isHeic) {
        return (
            <img src={previewUrl} alt={attachment.file_name} loading="lazy" className="h-full w-full object-contain" />
        );
    }

    if (preview.key !== previewUrl) {
        return (
            <span className="text-sm text-muted-foreground" role="status">
                กำลังโหลดภาพ...
            </span>
        );
    }

    if (preview.error) {
        return <span className="p-3 text-center text-sm text-muted-foreground">ไม่สามารถแสดงตัวอย่างภาพได้</span>;
    }

    return <img src={preview.url} alt={attachment.file_name} loading="lazy" className="h-full w-full object-contain" />;
};

const IssueDetail = () => {
    const { ticketNumber } = useParams();
    const navigate = useNavigate();

    const [issue, setIssue] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [isCopied, setIsCopied] = useState(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
    const [statusError, setStatusError] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
    const [attachmentsError, setAttachmentsError] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");

    useDocumentTitle(`Issue #${ticketNumber}`);

    const fetchAttachments = useCallback(
        async (signal) => {
            setIsLoadingAttachments(true);
            setAttachmentsError("");
            setAttachments([]);

            try {
                const data = await getIssueAttachments(ticketNumber, { signal });

                if (!data.success || !Array.isArray(data.attachments)) {
                    throw new Error(data.message || "Failed to fetch issue attachments");
                }

                setAttachments(data.attachments);
            } catch (requestError) {
                if (requestError.name === "AbortError") {
                    return;
                }

                setAttachmentsError("Unable to load attachments. Please try again.");
            } finally {
                if (!signal.aborted) {
                    setIsLoadingAttachments(false);
                }
            }
        },
        [ticketNumber],
    );

    useEffect(() => {
        const controller = new AbortController();

        const timeoutId = setTimeout(() => {
            fetchAttachments(controller.signal);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [fetchAttachments]);

    const fetchIssue = useCallback(
        async (signal) => {
            setIsLoading(true);
            setError("");
            setIssue(null);

            try {
                const data = await getIssue(ticketNumber, { signal });

                if (!data.success || !data.issue) {
                    throw new Error(data.message || "Failed to fetch issue");
                }

                setIssue(data.issue);
            } catch (requestError) {
                if (requestError.name === "AbortError") {
                    return;
                }

                setError(
                    requestError.message === "Issue not found"
                        ? "The requested issue could not be found."
                        : "Unable to load issue details. Please try again.",
                );
            } finally {
                if (!signal.aborted) {
                    setIsLoading(false);
                }
            }
        },
        [ticketNumber],
    );

    useEffect(() => {
        const controller = new AbortController();

        const timeoutId = setTimeout(() => {
            fetchIssue(controller.signal);
        }, 0);

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [fetchIssue]);

    const handleRetry = () => {
        const controller = new AbortController();

        fetchIssue(controller.signal);
    };

    const handleStatusChange = async (event) => {
        const nextStatus = event.target.value;

        if (!issue || nextStatus === issue.status || isUpdatingStatus) {
            return;
        }

        const previousStatus = issue.status;

        setIsUpdatingStatus(true);
        setStatusError("");

        try {
            const data = await updateIssueStatus(issue.ticket_number, nextStatus);

            if (!data.success || !data.issue) {
                throw new Error(data.message || "Failed to update issue status");
            }

            setIssue(data.issue);
        } catch (requestError) {
            setStatusError(
                requestError.message === "Issue not found"
                    ? "This issue could not be found. Please reload the page."
                    : "Unable to update status. Please try again.",
            );

            setIssue((currentIssue) => (currentIssue ? { ...currentIssue, status: previousStatus } : currentIssue));
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    const handleCopyTicket = async () => {
        try {
            await navigator.clipboard.writeText(issue.ticket_number);
            setIsCopied(true);

            setTimeout(() => {
                setIsCopied(false);
            }, 2000);
        } catch {
            setError("Unable to copy ticket number. Please copy it manually.");
        }
    };

    const handleDeleteIssue = async () => {
        if (!issue || isDeleting || !window.confirm(`Delete issue ${issue.ticket_number}? This cannot be undone.`)) {
            return;
        }

        setIsDeleting(true);
        setDeleteError("");

        try {
            const data = await deleteIssue(issue.ticket_number);
            setIsDeleting(false);

            if (!data.success) {
                setDeleteError(data.message || "Unable to delete issue. Please try again.");
                throw new Error(data.message || "Failed to delete issue");
            }

            navigate("/issues", { replace: true });
        } catch (requestError) {
            setDeleteError(requestError.message || "Unable to delete issue. Please try again.");
            setIsDeleting(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl animate-fadeInUp">
            <Link
                to="/issues"
                className={cx(
                    "inline-flex items-center gap-2 text-sm",
                    "text-muted-foreground transition-colors",
                    "hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-ring/20",
                )}
            >
                <span aria-hidden="true">←</span>
                Back to Issues
            </Link>

            <div className="mb-6 mt-6">
                <h2 className="text-2xl font-semibold tracking-tight">Issue Details</h2>

                <p className="mt-2 text-sm text-muted-foreground">
                    View the information and status of this reported issue.
                </p>
            </div>

            {isLoading ? (
                <div
                    className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground gap-2 flex items-center justify-center"
                    role="status"
                >
                    <Loader className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading issue details...
                </div>
            ) : error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
                    <h3 className="font-medium">Unable to display issue</h3>

                    <p className="mt-2 text-sm text-destructive">{error}</p>

                    <div className="mt-4 flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={isLoading}
                            className={cx(
                                "inline-flex h-9 items-center justify-center",
                                "rounded-lg border border-input px-3 text-sm font-medium",
                                "transition-colors hover:bg-muted",
                                "focus-visible:outline-none focus-visible:ring-2",
                                "focus-visible:ring-ring/20",
                                "disabled:pointer-events-none disabled:opacity-50",
                            )}
                        >
                            Try again
                        </button>

                        <Link
                            to="/issues"
                            className={cx(
                                "inline-flex h-9 items-center justify-center",
                                "rounded-lg px-3 text-sm font-medium",
                                "transition-colors hover:bg-muted",
                            )}
                        >
                            View all issues
                        </Link>
                    </div>
                </div>
            ) : issue ? (
                <div className="space-y-6">
                    <section className="rounded-xl border border-border p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-3">
                                    <p className="text-sm font-medium text-muted-foreground">{issue.ticket_number}</p>

                                    <button
                                        type="button"
                                        onClick={handleCopyTicket}
                                        className={cx(
                                            "inline-flex h-8 items-center justify-center gap-2",
                                            "rounded-md border border-input px-2.5 text-xs font-medium",
                                            "transition-colors hover:bg-muted",
                                            "focus-visible:outline-none focus-visible:ring-2",
                                            "focus-visible:ring-ring/20",
                                        )}
                                    >
                                        {isCopied ? (
                                            <Check size={16} aria-hidden="true" />
                                        ) : (
                                            <Copy size={16} aria-hidden="true" />
                                        )}
                                    </button>
                                </div>

                                <h3 className="mt-2 break-words text-xl font-semibold tracking-tight">{issue.title}</h3>

                                <p className="mt-2 text-sm font-bold text-muted-foreground">{issue.category}</p>

                                <p className="mt-2 text-sm text-muted-foreground">{issue.description}</p>

                                <p className="mt-2 text-sm text-muted-foreground">
                                    Reported on {formatDate(issue.created_at)}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <label className="sr-only" htmlFor="issue-status">
                                    Issue status
                                </label>

                                <select
                                    id="issue-status"
                                    value={issue.status}
                                    onChange={handleStatusChange}
                                    disabled={isUpdatingStatus}
                                    aria-describedby={statusError ? "status-error" : undefined}
                                    className={cx(
                                        "h-8 rounded-full border border-transparent px-4",
                                        "text-xs font-medium py-2",
                                        "transition-colors",
                                        "focus-visible:outline-none focus-visible:ring-2",
                                        "focus-visible:ring-ring/50",
                                        "disabled:cursor-wait disabled:opacity-60",
                                        statusStyles[issue.status] || "bg-muted text-muted-foreground",
                                    )}
                                >
                                    <option value="Open">Open</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Resolved">Resolved</option>
                                </select>

                                <Badge className={priorityStyles[issue.priority] || "bg-muted text-muted-foreground"}>
                                    {issue.priority} Priority
                                </Badge>

                                <button
                                    type="button"
                                    onClick={handleDeleteIssue}
                                    disabled={isDeleting || isUpdatingStatus}
                                    className={cx(
                                        "inline-flex h-8 items-center justify-center gap-2 rounded-md cursor-pointer",
                                        "border border-destructive/30 px-3 text-xs font-medium text-destructive",
                                        "transition-colors hover:bg-destructive/10",
                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30",
                                        "disabled:pointer-events-none disabled:opacity-50",
                                    )}
                                >
                                    <Trash2 size={14} aria-hidden="true" />
                                    {isDeleting ? "Deleting..." : "Delete issue"}
                                </button>
                            </div>

                            {isUpdatingStatus && (
                                <p className="mt-3 text-xs text-muted-foreground" role="status">
                                    Updating status...
                                </p>
                            )}

                            {statusError && (
                                <p id="status-error" className="mt-3 text-sm text-destructive" role="alert">
                                    {statusError}
                                </p>
                            )}
                        </div>
                    </section>

                    {deleteError && (
                        <p
                            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                            role="alert"
                        >
                            {deleteError}
                        </p>
                    )}

                    <section className="rounded-xl border border-border p-5 sm:p-6">
                        <h3 className="font-semibold">Issue Information</h3>

                        <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            <DetailField label="Ticket Number">{issue.ticket_number}</DetailField>

                            <DetailField label="Created At">{formatDate(issue.created_at)}</DetailField>

                            <DetailField label="Reporter">{issue.reporter_name}</DetailField>

                            <DetailField label="Category">{issue.category}</DetailField>

                            <DetailField label="Priority">{issue.priority}</DetailField>

                            <DetailField label="Status">{issue.status}</DetailField>

                            <DetailField label="Last Updated">{formatDate(issue.updated_at)}</DetailField>
                        </dl>
                    </section>

                    <section className="rounded-xl border border-border p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="font-semibold">Attachments</h3>

                            <span className="text-sm text-muted-foreground">
                                {attachments.length} {attachments.length === 1 ? "file" : "files"}
                            </span>
                        </div>

                        {isLoadingAttachments ? (
                            <p className="mt-4 text-sm text-muted-foreground" role="status">
                                Loading attachments...
                            </p>
                        ) : attachmentsError ? (
                            <div className="mt-4" role="alert">
                                <p className="text-sm text-destructive">{attachmentsError}</p>
                            </div>
                        ) : attachments.length === 0 ? (
                            <p className="mt-4 text-sm text-muted-foreground">No attachments found.</p>
                        ) : (
                            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {attachments.map((attachment) => {
                                    const isImage = attachment.mime_type?.startsWith("image/");
                                    const fileUrl = getIssueAttachmentUrl(issue.ticket_number, attachment.id);
                                    const previewUrl = getIssueAttachmentUrl(issue.ticket_number, attachment.id, true);

                                    return (
                                        <li
                                            key={attachment.id}
                                            className="min-w-0 overflow-hidden rounded-lg border border-border"
                                        >
                                            {isImage ? (
                                                <a
                                                    href={previewUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex aspect-video items-center justify-center overflow-hidden bg-muted"
                                                    aria-label={`Preview ${attachment.file_name}`}
                                                >
                                                    <AttachmentImagePreview
                                                        attachment={attachment}
                                                        previewUrl={previewUrl}
                                                    />
                                                </a>
                                            ) : (
                                                <div className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">
                                                    File
                                                </div>
                                            )}

                                            <div className="p-3">
                                                <p
                                                    className="truncate text-sm font-medium"
                                                    title={attachment.file_name}
                                                >
                                                    {attachment.file_name}
                                                </p>

                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {formatFileSize(attachment.file_size)}
                                                </p>

                                                <a
                                                    href={fileUrl}
                                                    download
                                                    aria-label={`Download ${attachment.file_name}`}
                                                    title="Download"
                                                    className={cx(
                                                        "mt-3 inline-flex size-9 items-center justify-center",
                                                        "rounded-md border border-input",
                                                        "transition-colors hover:bg-muted",
                                                        "focus-visible:outline-none focus-visible:ring-2",
                                                        "focus-visible:ring-ring/20",
                                                    )}
                                                >
                                                    <Download className="size-4" aria-hidden="true" />
                                                </a>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>
            ) : null}
        </div>
    );
};

export default IssueDetail;

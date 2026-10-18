import { api } from "../utils/api";

export function getIssues(options = {}) {
    const params = new URLSearchParams({
        limit: String(options.limit ?? 100),
    });

    return api(`/api/issues?${params}`, {
        signal: options.signal,
    });
}

export function getIssueStats(options = {}) {
    return api("/api/issues/stats", {
        signal: options.signal,
    });
}

export function createIssue(issueData, options = {}) {
    return api("/api/issues", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(issueData),
        signal: options.signal,
    });
}

export function getIssue(ticketNumber, options = {}) {
    return api(`/api/issues/${encodeURIComponent(ticketNumber)}`, {
        signal: options.signal,
    });
}

export function updateIssueStatus(ticketNumber, status, options = {}) {
    return api(`/api/issues/${encodeURIComponent(ticketNumber)}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
        signal: options.signal,
    });
}

export function uploadIssueAttachment(ticketNumber, file, options = {}) {
    const formData = new FormData();

    formData.append("file", file);

    return api(`/api/issues/${encodeURIComponent(ticketNumber)}/attachments`, {
        method: "POST",
        body: formData,
        signal: options.signal,
    });
}

export function getIssueAttachments(ticketNumber, options = {}) {
    return api(`/api/issues/${encodeURIComponent(ticketNumber)}/attachments`, { signal: options.signal });
}

export function getIssueAttachmentUrl(ticketNumber, attachmentId, inline = false) {
    const params = inline ? "?inline=1" : "";

    return `/api/issues/${encodeURIComponent(ticketNumber)}/attachments/${encodeURIComponent(attachmentId)}${params}`;
}
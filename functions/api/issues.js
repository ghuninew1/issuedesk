import { requireRole } from "./auth/_utils.js";

const ALLOWED_CATEGORIES = ["Hardware", "Software", "Network", "Printer", "Other"];

const ALLOWED_PRIORITIES = ["Low", "Medium", "High"];

function jsonResponse(data, status = 200) {
    return Response.json(data, { status });
}

function getTicketPrefix() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === "year").value;
    const month = parts.find((part) => part.type === "month").value;

    return `IT-${year}${month}-`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };

        return entities[character];
    });
}

async function sendIssueNotification(issue, env) {
    if (!env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
    }

    if (!env.ISSUE_NOTIFICATION_EMAIL) {
        throw new Error("ISSUE_NOTIFICATION_EMAIL is not configured");
    }

    if (!env.RESEND_FROM_EMAIL) {
        throw new Error("RESEND_FROM_EMAIL is not configured");
    }

    const ticketNumber = escapeHtml(issue.ticket_number);
    const reporter = escapeHtml(issue.reporter_name);
    const title = escapeHtml(issue.title);
    const category = escapeHtml(issue.category);
    const priority = escapeHtml(issue.priority);
    const description = escapeHtml(issue.description);
    const status = escapeHtml(issue.status);
    const createdAt = escapeHtml(issue.created_at);

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL,
            to: [env.ISSUE_NOTIFICATION_EMAIL],
            subject: `[IssueDesk] New Issue ${issue.ticket_number}`,
            html: `
                <!DOCTYPE html>
                <html lang="en">
                    <head>
                        <meta charset="UTF-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                    </head>
                    <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
                        <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">
                            <h2 style="margin-top:0;">New Issue Reported</h2>

                            <p>A new IT issue has been submitted to IssueDesk.</p>

                            <div style="padding:16px;background:#f9fafb;border-radius:8px;">
                                <p><strong>Ticket:</strong> ${ticketNumber}</p>
                                <p><strong>Reporter:</strong> ${reporter}</p>
                                <p><strong>Title:</strong> ${title}</p>
                                <p><strong>Category:</strong> ${category}</p>
                                <p><strong>Priority:</strong> ${priority}</p>
                                <p><strong>Status:</strong> ${status}</p>
                                <p><strong>Submitted:</strong> ${createdAt}</p>
                            </div>

                            <h3>Description</h3>

                            <div style="white-space:pre-wrap;overflow-wrap:anywhere;">${description}</div>

                            <p style="margin-top:24px;color:#6b7280;font-size:12px;">
                                This is an automated notification from IssueDesk.
                            </p>
                        </div>
                    </body>
                </html>
            `,
            text: [
                "New Issue Reported",
                "",
                `Ticket: ${issue.ticket_number}`,
                `Reporter: ${issue.reporter_name}`,
                `Title: ${issue.title}`,
                `Category: ${issue.category}`,
                `Priority: ${issue.priority}`,
                `Status: ${issue.status}`,
                `Submitted: ${issue.created_at}`,
                "",
                "Description:",
                issue.description,
            ].join("\n"),
        }),
    });

    if (!response.ok) {
        const errorDetails = await response.text();

        throw new Error(`Resend API failed (${response.status}): ${errorDetails}`);
    }

    return response.json();
}

// On request Post
export async function onRequestPost({ request, env }) {
    let body;

    try {
        body = await request.json();
    } catch {
        return jsonResponse(
            {
                success: false,
                message: "Invalid JSON request",
            },
            400,
        );
    }

    const reporterName = typeof body?.reporter === "string" ? body.reporter.trim() : "";

    const title = typeof body?.title === "string" ? body.title.trim() : "";

    const category = body?.category;

    const priority = body?.priority ?? "Medium";

    const description = typeof body?.description === "string" ? body.description.trim() : "";

    if (
        !reporterName ||
        !title ||
        !description ||
        reporterName.length > 100 ||
        title.length > 200 ||
        description.length > 5000 ||
        !ALLOWED_CATEGORIES.includes(category) ||
        !ALLOWED_PRIORITIES.includes(priority)
    ) {
        return jsonResponse(
            {
                success: false,
                message: "Invalid issue data",
            },
            400,
        );
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const ticketPrefix = getTicketPrefix();

    try {
        const issue = await env.DB.prepare(
            `
                INSERT INTO issues (
                    id,
                    ticket_number,
                    reporter_name,
                    title,
                    category,
                    priority,
                    description,
                    status,
                    created_at,
                    updated_at
                )
                SELECT
                    ?,
                    ? || printf(
                        '%04d',
                        COALESCE(
                            MAX(
                                CAST(
                                    substr(ticket_number, ?) AS INTEGER
                                )
                            ),
                            0
                        ) + 1
                    ),
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'Open',
                    ?,
                    ?
                FROM issues
                WHERE ticket_number LIKE ?
                RETURNING
                    id,
                    ticket_number,
                    reporter_name,
                    title,
                    category,
                    priority,
                    description,
                    status,
                    created_at
            `,
        )
            .bind(
                id,
                ticketPrefix,
                ticketPrefix.length + 1,
                reporterName,
                title,
                category,
                priority,
                description,
                createdAt,
                createdAt,
                `${ticketPrefix}%`,
            )
            .first();

        if (!issue) {
            throw new Error("Issue was not created");
        }

        try {
            await sendIssueNotification(issue, env);

            console.info("Issue notification email sent:", issue.ticket_number);
        } catch (error) {
            console.error("Failed to send issue notification email:", issue.ticket_number, error);
        }

        return jsonResponse(
            {
                success: true,
                message: "Issue created successfully",
                issue,
            },
            201,
        );
    } catch (error) {
        console.error("Failed to create issue:", error);

        return jsonResponse(
            {
                success: false,
                message: "Failed to create issue",
            },
            500,
        );
    }
}

// On request Get
export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? 20);

    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;

    try {
        const result = await env.DB.prepare(
            `
        SELECT
            i.id,
            i.ticket_number,
            i.reporter_name,
            i.title,
            i.category,
            i.priority,
            i.description,
            i.status,
            i.created_at,
            i.updated_at,
            (
                SELECT COUNT(*)
                FROM issue_attachments AS a
                WHERE a.issue_id = i.id
            ) AS attachment_count
        FROM issues AS i
        ORDER BY i.created_at DESC, i.ticket_number DESC
        LIMIT ?
    `,
        )
            .bind(limit)
            .all();

        return Response.json({
            success: true,
            issues: result.results,
            count: result.results.length,
        });
    } catch (error) {
        console.error("Failed to fetch issues:", error);

        return Response.json(
            {
                success: false,
                message: "Failed to fetch issues",
            },
            { status: 500 },
        );
    }
}

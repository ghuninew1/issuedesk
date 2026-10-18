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

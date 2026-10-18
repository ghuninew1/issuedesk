import { requireRole } from "../auth/_utils.js";

function jsonResponse(data, status = 200) {
    return Response.json(data, { status });
}

export async function onRequestGet({ request, params, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const ticketNumber = params.ticketNumber?.trim();

    if (!ticketNumber) {
        return jsonResponse(
            {
                success: false,
                message: "Ticket number is required",
            },
            400,
        );
    }

    try {
        const issue = await env.DB.prepare(
            `
                SELECT
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
                FROM issues
                WHERE ticket_number = ?
                LIMIT 1
            `,
        )
            .bind(ticketNumber)
            .first();

        if (!issue) {
            return jsonResponse(
                {
                    success: false,
                    message: "Issue not found",
                },
                404,
            );
        }

        return jsonResponse({
            success: true,
            issue,
        });
    } catch (error) {
        console.error("Failed to fetch issue:", error);

        return jsonResponse(
            {
                success: false,
                message: "Failed to fetch issue",
            },
            500,
        );
    }
}

const ALLOWED_STATUSES = ["Open", "In Progress", "Resolved"];

export async function onRequestPatch({ request, params, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const ticketNumber = params.ticketNumber?.trim();

    if (!ticketNumber) {
        return jsonResponse(
            {
                success: false,
                message: "Ticket number is required",
            },
            400,
        );
    }

    let body;

    try {
        body = await request.json();
    } catch {
        return jsonResponse(
            {
                success: false,
                message: "Invalid JSON body",
            },
            400,
        );
    }

    const { status } = body ?? {};

    if (typeof status !== "string" || !ALLOWED_STATUSES.includes(status)) {
        return jsonResponse(
            {
                success: false,
                message: "Invalid issue status",
            },
            400,
        );
    }

    try {
        const result = await env.DB.prepare(
            `
                UPDATE issues
                SET
                    status = ?,
                    updated_at = datetime('now')
                WHERE ticket_number = ?
            `,
        )
            .bind(status, ticketNumber)
            .run();

        if (result.meta.changes === 0) {
            return jsonResponse(
                {
                    success: false,
                    message: "Issue not found",
                },
                404,
            );
        }

        const issue = await env.DB.prepare(
            `
                SELECT
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
                FROM issues
                WHERE ticket_number = ?
                LIMIT 1
            `,
        )
            .bind(ticketNumber)
            .first();

        return jsonResponse({
            success: true,
            message: "Issue status updated successfully",
            issue,
        });
    } catch (error) {
        console.error("Failed to update issue status:", error);

        return jsonResponse(
            {
                success: false,
                message: "Failed to update issue status",
            },
            500,
        );
    }
}


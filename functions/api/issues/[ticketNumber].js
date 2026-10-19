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
const STORAGE_PROJECT_ID = "6832c1ea-1826-4775-80ef-153bab766e4c";

export async function onRequestDelete({ request, params, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;

    const ticketNumber = params.ticketNumber?.trim();
    if (!ticketNumber) {
        return jsonResponse({ success: false, message: "Ticket number is required" }, 400);
    }

    try {
        const issue = await env.DB.prepare(
            "SELECT id, ticket_number FROM issues WHERE ticket_number = ? LIMIT 1",
        )
            .bind(ticketNumber)
            .first();

        if (!issue) {
            return jsonResponse({ success: false, message: "Issue not found" }, 404);
        }

        const attachments = await env.DB.prepare(
            "SELECT id, storage_file_id FROM issue_attachments WHERE issue_id = ?",
        )
            .bind(issue.id)
            .all();

        if (attachments.results.length > 0) {
            const requiredEnv = ["STORAGE_API_URL", "STORAGE_APP_SECRET", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"];
            if (requiredEnv.some((key) => !env[key])) {
                return jsonResponse({ success: false, message: "Storage API configuration is incomplete" }, 500);
            }

            const baseUrl = env.STORAGE_API_URL.replace(/\/+$/, "");
            for (const attachment of attachments.results) {
                let storageResponse;
                try {
                    storageResponse = await fetch(
                        `${baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files/${encodeURIComponent(attachment.storage_file_id)}`,
                        {
                            method: "DELETE",
                            headers: {
                                "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
                                "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
                                Authorization: `Bearer ${env.STORAGE_APP_SECRET}`,
                            },
                        },
                    );
                } catch (error) {
                    console.error("Storage delete request failed:", error);
                    return jsonResponse({ success: false, message: "Unable to contact Storage API" }, 502);
                }

                // A missing Storage file is already in the desired state. Continue
                // so retries can clean up IssueDesk metadata after partial failures.
                if (storageResponse.status === 404) {
                    continue;
                }

                if (!storageResponse.ok) {
                    console.error("Storage delete failed:", storageResponse.status, attachment.id);
                    return jsonResponse(
                        {
                            success: false,
                            message: `Storage API could not delete attachment (${storageResponse.status})`,
                        },
                        502,
                    );
                }

                const contentType = storageResponse.headers.get("content-type") || "";
                if (contentType.includes("application/json")) {
                    let storageResult;
                    try {
                        storageResult = await storageResponse.json();
                    } catch {
                        return jsonResponse(
                            { success: false, message: "Storage API returned an invalid delete response" },
                            502,
                        );
                    }

                    if (storageResult?.success !== true) {
                        console.error("Storage API did not confirm attachment deletion:", attachment.id);
                        return jsonResponse(
                            { success: false, message: "Storage API did not confirm attachment deletion" },
                            502,
                        );
                    }
                }
            }
        }

        // Delete child rows explicitly instead of depending only on D1's
        // foreign-key cascade behavior in every deployed database.
        await env.DB.prepare("DELETE FROM issue_attachments WHERE issue_id = ?")
            .bind(issue.id)
            .run();

        const result = await env.DB.prepare("DELETE FROM issues WHERE id = ? AND ticket_number = ?")
            .bind(issue.id, issue.ticket_number)
            .run();

        if (result.meta.changes !== 1) {
            return jsonResponse({ success: false, message: "Issue could not be deleted" }, 500);
        }

        return jsonResponse({ success: true, message: "Issue deleted successfully" });
    } catch (error) {
        console.error("Failed to delete issue:", error);
        return jsonResponse({ success: false, message: "Failed to delete issue" }, 500);
    }
}

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


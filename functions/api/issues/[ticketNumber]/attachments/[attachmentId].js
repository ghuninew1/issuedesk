import { requireRole } from "../../../auth/_utils.js";

function jsonResponse(data, status = 200) {
    return Response.json(data, { status });
}

const STORAGE_PROJECT_ID = "6832c1ea-1826-4775-80ef-153bab766e4c";

export async function onRequestGet({ request, params, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const ticketNumber = params.ticketNumber?.trim();
    const attachmentId = params.attachmentId?.trim();

    if (!ticketNumber || !attachmentId) {
        return jsonResponse({ success: false, message: "Ticket number and attachment ID are required" }, 400);
    }

    const requiredEnv = ["STORAGE_API_URL", "STORAGE_APP_SECRET", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"];

    if (requiredEnv.some((key) => !env[key])) {
        return jsonResponse({ success: false, message: "Storage API configuration is incomplete" }, 500);
    }

    try {
        const attachment = await env.DB.prepare(
            `
                SELECT
                    a.id,
                    a.storage_file_id,
                    a.file_name,
                    a.mime_type,
                    a.file_size
                FROM issue_attachments a
                INNER JOIN issues i ON i.id = a.issue_id
                WHERE i.ticket_number = ?
                  AND a.id = ?
                LIMIT 1
            `,
        )
            .bind(ticketNumber, attachmentId)
            .first();

        if (!attachment) {
            return jsonResponse({ success: false, message: "Attachment not found" }, 404);
        }

        const baseUrl = env.STORAGE_API_URL.replace(/\/+$/, "");

        const response = await fetch(
            `${baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files/${encodeURIComponent(attachment.storage_file_id)}`,
            {
                method: "GET",
                headers: {
                    "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
                    "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
                    Authorization: `Bearer ${env.STORAGE_APP_SECRET}`,
                },
            },
        );

        if (!response.ok) {
            console.error("Storage download failed:", response.status);

            if (response.status === 404) {
                return jsonResponse({ success: false, message: "File not found in storage" }, 404);
            }

            return jsonResponse({ success: false, message: "Storage API download failed" }, 502);
        }

        if (!response.body) {
            return jsonResponse({ success: false, message: "Storage API returned an empty response" }, 502);
        }

        const url = new URL(request.url);
        const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";

        const headers = new Headers({
            "Content-Type": attachment.mime_type || "application/octet-stream",
            "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        });

        if (response.headers.has("content-length")) {
            headers.set("Content-Length", response.headers.get("content-length"));
        }

        return new Response(response.body, {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error("Failed to download issue attachment:", error);

        return jsonResponse({ success: false, message: "Failed to download attachment" }, 500);
    }
}

export async function onRequestDelete({ request, params, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    const ticketNumber = params.ticketNumber?.trim();
    const attachmentId = params.attachmentId?.trim();

    if (!ticketNumber || !attachmentId) {
        return jsonResponse(
            {
                success: false,
                message: "Ticket number and attachment ID are required",
            },
            400,
        );
    }

    const requiredEnv = ["STORAGE_API_URL", "STORAGE_APP_SECRET", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"];

    if (requiredEnv.some((key) => !env[key])) {
        return jsonResponse(
            {
                success: false,
                message: "Storage API configuration is incomplete",
            },
            500,
        );
    }

    let attachment;

    try {
        attachment = await env.DB.prepare(
            `
                SELECT
                    a.id,
                    a.issue_id,
                    a.storage_file_id
                FROM issue_attachments a
                INNER JOIN issues i ON i.id = a.issue_id
                WHERE i.ticket_number = ?
                  AND a.id = ?
                LIMIT 1
            `,
        )
            .bind(ticketNumber, attachmentId)
            .first();
    } catch (error) {
        console.error("Failed to fetch attachment for deletion:", error);

        return jsonResponse(
            {
                success: false,
                message: "Failed to verify attachment",
            },
            500,
        );
    }

    if (!attachment) {
        return jsonResponse(
            {
                success: false,
                message: "Attachment not found",
            },
            404,
        );
    }

    const baseUrl = env.STORAGE_API_URL.replace(/\/+$/, "");

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

        return jsonResponse(
            {
                success: false,
                message: "Unable to contact Storage API",
            },
            502,
        );
    }

    if (!storageResponse.ok) {
        console.error("Storage delete failed:", storageResponse.status);

        return jsonResponse(
            {
                success: false,
                message:
                    storageResponse.status === 404
                        ? "File not found in storage; attachment metadata was preserved"
                        : "Storage API could not confirm file deletion",
            },
            storageResponse.status === 404 ? 409 : 502,
        );
    }

    try {
        const result = await env.DB.prepare(
            `
                DELETE FROM issue_attachments
                WHERE id = ?
                  AND issue_id = ?
                  AND storage_file_id = ?
            `,
        )
            .bind(attachment.id, attachment.issue_id, attachment.storage_file_id)
            .run();

        if (result.meta.changes !== 1) {
            console.error("Storage file deleted but IssueDesk metadata cleanup failed:", attachment.id);

            return jsonResponse(
                {
                    success: false,
                    message: "File was deleted from storage, but attachment metadata cleanup failed",
                },
                500,
            );
        }

        return jsonResponse({
            success: true,
            message: "Attachment deleted successfully",
            attachmentId: attachment.id,
        });
    } catch (error) {
        console.error("Failed to delete attachment metadata:", error);

        return jsonResponse(
            {
                success: false,
                message: "File was deleted from storage, but attachment metadata cleanup failed",
            },
            500,
        );
    }
}


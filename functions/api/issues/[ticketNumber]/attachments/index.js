import { requireRole } from "../../../auth/_utils.js";

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
                SELECT id, ticket_number
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

        const result = await env.DB.prepare(
            `
                SELECT
                    id,
                    file_name,
                    mime_type,
                    file_size,
                    uploaded_at
                FROM issue_attachments
                WHERE issue_id = ?
                ORDER BY uploaded_at DESC
            `,
        )
            .bind(issue.id)
            .all();

        return jsonResponse({
            success: true,
            ticketNumber: issue.ticket_number,
            attachments: result.results,
        });
    } catch (error) {
        console.error("Failed to fetch issue attachments:", error);

        return jsonResponse(
            {
                success: false,
                message: "Failed to fetch issue attachments",
            },
            500,
        );
    }
}

const STORAGE_PROJECT_ID = "6832c1ea-1826-4775-80ef-153bab766e4c";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

async function detectHeifMimeType(file) {
    const bytes = new Uint8Array(await file.slice(4, 12).arrayBuffer());

    const signature = String.fromCharCode(...bytes);

    if (!signature.startsWith("ftyp")) {
        return null;
    }

    const brand = signature.slice(4, 8);

    const heicBrands = new Set(["heic", "heix", "hevc", "hevx"]);
    const heifBrands = new Set(["mif1", "msf1"]);

    if (heicBrands.has(brand)) {
        return "image/heic";
    }

    if (heifBrands.has(brand)) {
        return "image/heif";
    }

    return null;
}

export async function onRequestPost({ request, params, env }) {
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

    const requiredEnv = ["STORAGE_API_URL", "STORAGE_APP_SECRET", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"];

    const missingEnv = requiredEnv.filter((key) => typeof env[key] !== "string" || !env[key].trim());

    if (missingEnv.length > 0) {
        console.error("Missing Storage API environment variables:", missingEnv);

        return jsonResponse(
            {
                success: false,
                message: "Storage API configuration is incomplete",
            },
            500,
        );
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return jsonResponse(
            {
                success: false,
                message: "Content-Type must be multipart/form-data",
            },
            415,
        );
    }

    let form;

    try {
        form = await request.formData();
    } catch {
        return jsonResponse(
            {
                success: false,
                message: "Invalid multipart form data",
            },
            400,
        );
    }

    const file = form.get("file");

    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
        return jsonResponse(
            {
                success: false,
                message: "A file field is required",
            },
            400,
        );
    }

    if (file.size === 0) {
        return jsonResponse(
            {
                success: false,
                message: "Empty files are not allowed",
            },
            400,
        );
    }

    if (file.size > MAX_FILE_SIZE) {
        return jsonResponse(
            {
                success: false,
                message: "File exceeds the 10 MiB upload limit",
            },
            413,
        );
    }

    let mimeType = file.type || "application/octet-stream";

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        const detectedHeifMime = await detectHeifMimeType(file);

        if (detectedHeifMime) {
            mimeType = detectedHeifMime;
        }
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return jsonResponse(
            {
                success: false,
                message: "File type is not allowed",
            },
            415,
        );
    }

    let issue;

    try {
        issue = await env.DB.prepare(
            `
                SELECT id, ticket_number
                FROM issues
                WHERE ticket_number = ?
                LIMIT 1
            `,
        )
            .bind(ticketNumber)
            .first();
    } catch (error) {
        console.error("Failed to fetch issue for upload:", error);

        return jsonResponse(
            {
                success: false,
                message: "Failed to verify issue",
            },
            500,
        );
    }

    if (!issue) {
        return jsonResponse(
            {
                success: false,
                message: "Issue not found",
            },
            404,
        );
    }

    const baseUrl = env.STORAGE_API_URL.replace(/\/+$/, "");

    let storageFileId;

    try {
        const storageForm = new FormData();

        storageForm.append("file", file, file.name || "unnamed-file");

        const response = await fetch(`${baseUrl}/v2/projects/${STORAGE_PROJECT_ID}/files`, {
            method: "POST",
            headers: {
                "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
                "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
                Authorization: `Bearer ${env.STORAGE_APP_SECRET}`,
            },
            body: storageForm,
        });

        if (!response.ok) {
            console.error("Storage upload failed:", response.status);

            return jsonResponse(
                {
                    success: false,
                    message: "Storage API upload failed",
                    upstreamStatus: response.status,
                },
                502,
            );
        }

        const data = await response.json();

        if (data.success !== true || typeof data.file?.id !== "string" || !data.file.id) {
            console.error("Storage API returned an invalid upload response");

            return jsonResponse(
                {
                    success: false,
                    message: "Storage API returned an invalid response",
                },
                502,
            );
        }

        storageFileId = data.file.id;
    } catch (error) {
        console.error("Storage upload request failed:", error);

        return jsonResponse(
            {
                success: false,
                message: "Unable to upload file to Storage API",
            },
            502,
        );
    }

    const attachmentId = crypto.randomUUID();

    try {
        await env.DB.prepare(
            `
                INSERT INTO issue_attachments (
                    id,
                    issue_id,
                    storage_file_id,
                    file_name,
                    mime_type,
                    file_size
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `,
        )
            .bind(attachmentId, issue.id, storageFileId, file.name || "unnamed-file", mimeType, file.size)
            .run();

        return jsonResponse(
            {
                success: true,
                message: "File uploaded successfully",
                attachment: {
                    id: attachmentId,
                    file_name: file.name || "unnamed-file",
                    mime_type: mimeType,
                    file_size: file.size,
                },
            },
            201,
        );
    } catch (error) {
        console.error("Failed to save attachment metadata:", error);

        return jsonResponse(
            {
                success: false,
                message: "File uploaded, but saving attachment metadata failed",
                attachmentSaved: false,
            },
            500,
        );
    }
}


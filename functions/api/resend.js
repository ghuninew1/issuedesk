import { sendResendEmail } from "./resend/_utils.js";

const MAX_BODY_BYTES = 24_000;
const BBS_ORIGIN = "https://www.bigbrain-studio.com";

function getAllowedOrigins(env) {
    return (env.RESEND_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function response(data, status, origin) {
    const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });

    if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
    }

    return new Response(JSON.stringify(data), { status, headers });
}

function checkOrigin(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = getAllowedOrigins(env);

    if (!origin || !allowedOrigins.includes(origin)) {
        return { error: response({ success: false, message: "Origin is not allowed" }, 403) };
    }

    return { origin };
}

export async function onRequestOptions({ request, env }) {
    const { origin, error } = checkOrigin(request, env);
    if (error) return error;

    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin",
        },
    });
}

export async function onRequestPost({ request, env }) {
    const { origin, error } = checkOrigin(request, env);
    if (error) return error;

    const contentLength = Number(request.headers.get("Content-Length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return response({ success: false, message: "Request body is too large" }, 413, origin);
    }

    let rawBody;
    let body;
    try {
        rawBody = await request.text();
        if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
            return response({ success: false, message: "Request body is too large" }, 413, origin);
        }
        body = JSON.parse(rawBody);
    } catch {
        return response({ success: false, message: "Invalid JSON request" }, 400, origin);
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
        !name || name.length > 100 ||
        !emailPattern.test(email) || email.length > 254 ||
        !subject || subject.length > 150 ||
        !message || message.length > 5000
    ) {
        return response({ success: false, message: "Invalid contact form data" }, 400, origin);
    }

    const isBbs = origin === BBS_ORIGIN;
    const recipient = isBbs ? env.BBS_CONTACT_TO_EMAIL : env.RESEND_TO_EMAIL || env.ISSUE_NOTIFICATION_EMAIL;
    if (!recipient || (isBbs && !env.BBS_CONTACT_FROM_EMAIL)) {
        console.error("Contact email configuration is incomplete");
        return response({ success: false, message: "Email service is not configured" }, 503, origin);
    }

    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);
    const metadata = isBbs ? getMetadata(request) : null;
    const metadataHtml = metadata ? `<h3>Submission details</h3>${Object.entries(metadata).map(([key, value]) => `<p><strong>${key}:</strong> ${escapeHtml(value)}</p>`).join("")}` : "";
    const metadataText = metadata ? ["", "Submission details:", ...Object.entries(metadata).map(([key, value]) => `${key}: ${value}`)] : [];

    try {
        const mailEnv = isBbs ? { ...env, RESEND_FROM_EMAIL: env.BBS_CONTACT_FROM_EMAIL } : env;
        const result = await sendResendEmail(mailEnv, {
            to: [recipient],
            reply_to: email,
            subject: `${isBbs ? "[Big Brain Studio Website]" : "[Website]"} ${subject}`,
            html: `
                <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
                    <h2>Website contact form</h2>
                    <p><strong>Name:</strong> ${safeName}</p>
                    <p><strong>Email:</strong> ${safeEmail}</p>
                    <p><strong>Subject:</strong> ${safeSubject}</p>
                    <p><strong>Message:</strong></p>
                    <div style="white-space:pre-wrap;overflow-wrap:anywhere;">${safeMessage}</div>
                    ${metadataHtml}
                </div>
            `,
            text: [`Name: ${name}`, `Email: ${email}`, `Subject: ${subject}`, "", message, ...metadataText].join("\n"),
        });

        return response({ success: true, id: result.id }, 200, origin);
    } catch (sendError) {
        console.error("Failed to send website contact email:", sendError);
        return response({ success: false, message: "Failed to send email" }, 502, origin);
    }
}

function getMetadata(request) {
    const bounded = (value) => typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : "Not available";
    const ua = request.headers.get("User-Agent") || "";
    const browser = /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Firefox\//i.test(ua) ? "Firefox" : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : "Unknown";
    const device = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobile|iPhone|Android/i.test(ua) ? "Mobile" : ua ? "Unknown" : "Not available";
    return {
        Country: bounded(request.cf?.country),
        City: bounded(request.cf?.city),
        Referrer: bounded(request.headers.get("Referer")),
        Browser: browser,
        Device: device,
        Timestamp: new Date().toISOString(),
    };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[character]);
}

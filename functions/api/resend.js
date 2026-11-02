import { sendResendEmail } from "./resend/_utils.js";

const MAX_BODY_BYTES = 24_000;
const BBS_ORIGIN = "https://www.bigbrain-studio.com";
const BBS_LOGO_URL = "https://www.bigbrain-studio.com/img/logo-375x375.png";

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
            html: isBbs ? renderBbsContactEmail({ safeName, safeEmail, safeSubject, safeMessage, metadata }) : `
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

function renderBbsContactEmail({ safeName, safeEmail, safeSubject, safeMessage, metadata }) {
    const rows = (entries) => entries.map(([label, value]) => `
        <tr>
            <td style="padding:6px 12px 6px 0;vertical-align:top;color:#6b7280;font-size:14px;">${label}</td>
            <td style="padding:6px 0;vertical-align:top;color:#1f2937;font-size:14px;word-break:break-all;overflow-wrap:anywhere;">${value}</td>
        </tr>`).join("");
    const details = Object.entries(metadata).map(([label, value]) => [label, escapeHtml(value)]);
    const message = safeMessage.replace(/\r\n|\r|\n/g, "<br>");

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:16px 12px;">
        <!--[if mso]><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
            <tr><td style="padding:28px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><img src="${BBS_LOGO_URL}" width="150" alt="Big Brain Studio" style="display:block;width:150px;max-width:100%;height:auto;border:0;"></td></tr></table>
                <h1 style="margin:24px 0 8px;font-size:24px;line-height:1.3;color:#111827;">Website contact form</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;">New message received from the Big Brain Studio website.</p>
                <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">Contact information</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;line-height:1.5;">
                    ${rows([["Name", safeName], ["Email", safeEmail], ["Subject", safeSubject]])}
                </table>
                <h2 style="margin:24px 0 10px;font-size:16px;color:#111827;">Message</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;background-color:#f8faf8;border:1px solid #e1e9e2;border-left:3px solid #45845c;"><tr>
                    <td style="padding:16px;font-size:15px;line-height:1.6;color:#1f2937;word-break:break-all;overflow-wrap:anywhere;">${message}</td>
                </tr></table>
                <h2 style="margin:24px 0 8px;font-size:14px;color:#4b5563;">Submission details</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;line-height:1.4;">
                    ${rows(details)}
                </table>
                <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">Big Brain Studio</p>
            </td></tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
    </td></tr></table>
</body></html>`;
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
        Timestamp: `${new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "short" }).format(new Date())} (Asia/Bangkok)`,
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

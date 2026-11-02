const ISSUEDESK_LOGO_URL = "https://issuedesk.bigbrain-studio.com/favicon.png";

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

export async function sendResendEmail(env, payload) {
    if (!env.RESEND_API_KEY) {
        throw new Error("RESEND_API_KEY is not configured");
    }

    if (!env.RESEND_FROM_EMAIL) {
        throw new Error("RESEND_FROM_EMAIL is not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, ...payload }),
    });

    if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Resend API failed (${response.status}): ${errorDetails}`);
    }

    return response.json();
}

export async function sendIssueNotification(issue, env) {
    if (!env.ISSUE_NOTIFICATION_EMAIL) {
        throw new Error("ISSUE_NOTIFICATION_EMAIL is not configured");
    }

    const ticketNumber = escapeHtml(issue.ticket_number);
    const reporter = escapeHtml(issue.reporter_name);
    const title = escapeHtml(issue.title);
    const category = escapeHtml(issue.category);
    const priority = escapeHtml(issue.priority);
    const description = escapeHtml(issue.description).replace(/\r\n|\r|\n/g, "<br>");
    const status = escapeHtml(issue.status);
    const createdAt = escapeHtml(issue.created_at);

    return sendResendEmail(env, {
        to: [env.ISSUE_NOTIFICATION_EMAIL],
        subject: `[IssueDesk] New Issue ${issue.ticket_number}`,
        html: `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                </head>
                <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:16px 12px;">
                        <!--[if mso]><table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;"><tr><td style="padding:28px 24px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr><td align="center"><img src="${ISSUEDESK_LOGO_URL}" width="56" height="56" alt="IssueDesk" style="display:block;width:56px;height:56px;border:0;"></td></tr>
                                <tr><td align="center" style="padding-top:8px;font-size:20px;font-weight:bold;color:#111827;">IssueDesk</td></tr>
                            </table>
                            <h1 style="margin:24px 0 8px;font-size:24px;line-height:1.3;color:#111827;">New Issue Reported</h1>
                            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;">A new IT issue has been submitted to IssueDesk.</p>
                            <h2 style="margin:0 0 8px;font-size:16px;color:#111827;">Ticket details</h2>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;line-height:1.5;">
                                ${[["Ticket", ticketNumber], ["Reporter", reporter], ["Title", title], ["Category", category], ["Priority", priority], ["Status", status], ["Submitted", createdAt]].map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;color:#6b7280;font-size:14px;">${label}</td><td style="padding:6px 0;vertical-align:top;color:#1f2937;font-size:14px;word-break:break-all;overflow-wrap:anywhere;">${value}</td></tr>`).join("")}
                            </table>
                            <h2 style="margin:24px 0 10px;font-size:16px;color:#111827;">Description</h2>
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="table-layout:fixed;background-color:#f8fafc;border:1px solid #e1e9f0;border-left:3px solid #1688c7;"><tr><td style="padding:16px;font-size:15px;line-height:1.6;color:#1f2937;word-break:break-all;overflow-wrap:anywhere;">${description}</td></tr></table>
                            <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">This is an automated notification from IssueDesk.</p>
                        </td></tr></table>
                        <!--[if mso]></td></tr></table><![endif]-->
                    </td></tr></table>
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
    });
}

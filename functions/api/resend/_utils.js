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
    const description = escapeHtml(issue.description);
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
                        <p style="margin-top:24px;color:#6b7280;font-size:12px;">This is an automated notification from IssueDesk.</p>
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
    });
}

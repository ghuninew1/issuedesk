function jsonResponse(data, status = 200) {
    return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function onRequestGet({ params, env }) {
    const ticketNumber = params.ticketNumber?.trim().toUpperCase();
    if (!ticketNumber || !/^IT-\d{6}-\d{4,}$/.test(ticketNumber)) {
        return jsonResponse({ success: false, message: "Ticket not found" }, 404);
    }

    try {
        const ticket = await env.DB.prepare(
            "SELECT ticket_number, status, created_at, updated_at FROM issues WHERE ticket_number = ? LIMIT 1",
        ).bind(ticketNumber).first();

        if (!ticket) return jsonResponse({ success: false, message: "Ticket not found" }, 404);
        return jsonResponse({ success: true, ticket });
    } catch (error) {
        console.error("Failed to track ticket:", error);
        return jsonResponse({ success: false, message: "Unable to look up this ticket" }, 500);
    }
}

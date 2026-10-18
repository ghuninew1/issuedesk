import { requireRole } from "../auth/_utils.js";

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;
    try {
        const result = await env.DB.prepare(
            `
                SELECT
                    COUNT(*) AS total,
                    COALESCE(
                        SUM(CASE WHEN status = 'Open' THEN 1 ELSE 0 END),
                        0
                    ) AS open,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN status = 'In Progress' THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS in_progress,
                    COALESCE(
                        SUM(
                            CASE
                                WHEN status = 'Resolved' THEN 1
                                ELSE 0
                            END
                        ),
                        0
                    ) AS resolved
                FROM issues
            `,
        ).first();

        return Response.json({
            success: true,
            stats: {
                total: Number(result.total),
                open: Number(result.open),
                inProgress: Number(result.in_progress),
                resolved: Number(result.resolved),
            },
        });
    } catch (error) {
        console.error("Failed to fetch issue stats:", error);

        return Response.json(
            {
                success: false,
                message: "Failed to fetch issue statistics",
            },
            { status: 500 },
        );
    }
}

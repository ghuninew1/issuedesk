export async function onRequestGet({ env }) {
    try {
        const result = await env.DB.prepare("SELECT 1 AS connected").first();

        return Response.json({
            success: true,
            database: result?.connected === 1,
            message: "D1 connection successful",
        });
    } catch (error) {
        console.error("D1 connection error:", error);

        return Response.json(
            {
                success: false,
                message: "Database connection failed",
            },
            { status: 500 },
        );
    }
}

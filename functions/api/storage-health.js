function jsonResponse(data, status = 200) {
    return Response.json(data, { status });
}

export async function onRequestGet({ env }) {
    const requiredEnv = ["STORAGE_API_URL", "STORAGE_APP_SECRET", "CF_ACCESS_CLIENT_ID", "CF_ACCESS_CLIENT_SECRET"];

    const missingEnv = requiredEnv.filter((key) => !env[key]);

    if (missingEnv.length > 0) {
        return jsonResponse(
            {
                success: false,
                message: "Storage API configuration is incomplete",
                missing: missingEnv,
            },
            500,
        );
    }

    try {
        const baseUrl = env.STORAGE_API_URL.replace(/\/+$/, "");
        const projectId = "6832c1ea-1826-4775-80ef-153bab766e4c";

        const response = await fetch(`${baseUrl}/v2/projects/${projectId}/files`, {
            headers: {
                "CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
                "CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
                Authorization: `Bearer ${env.STORAGE_APP_SECRET}`,
            },
        });

        if (!response.ok) {
            console.error("Storage API request failed:", response.status);

            return jsonResponse(
                {
                    success: false,
                    message: "Storage API request failed",
                    upstreamStatus: response.status,
                },
                502,
            );
        }

        const data = await response.json();

        if (!data.success) {
            return jsonResponse(
                {
                    success: false,
                    message: "Storage API returned an unsuccessful response",
                },
                502,
            );
        }

        return jsonResponse({
            success: true,
            storageApi: true,
            project: data.project?.name ?? null,
            fileCount: Array.isArray(data.files) ? data.files.length : null,
            message: "Storage API authentication successful",
        });
    } catch (error) {
        console.error("Storage API connection error:", error);

        return jsonResponse(
            {
                success: false,
                message: "Unable to connect to Storage API",
            },
            502,
        );
    }
}

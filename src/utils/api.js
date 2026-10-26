const DEFAULT_HEADERS = {
    Accept: "application/json",
};

export async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...DEFAULT_HEADERS,
            ...options.headers,
        },
    });

    const contentType = response.headers.get("content-type");
    const isJson = contentType?.includes("application/json");

    let data = null;

    if (isJson) {
        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid JSON response");
        }
    }

    if (!response.ok) {
        const error = new Error(data?.error?.message || data?.message || `Request failed with status ${response.status}`);
        error.code = data?.error?.code;
        error.status = response.status;
        throw error;
    }

    if (!isJson) {
        throw new Error("Expected a JSON response");
    }

    return data;
}

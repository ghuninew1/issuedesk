import { jsonResponse, requireRole } from "../auth/_utils.js";

function textOrNull(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function onRequestGet({ request, env }) {
    const auth = await requireRole(request, env, "admin");
    if (auth.response) return auth.response;

    const edge = request.cf;
    const country = textOrNull(edge?.country);
    return jsonResponse({
        ip: edge ? textOrNull(request.headers.get("CF-Connecting-IP")) : null,
        isp: textOrNull(edge?.asOrganization),
        city: textOrNull(edge?.city),
        country: /^[A-Z]{2}$/.test(country ?? "") && country !== "XX" ? country : null,
    });
}

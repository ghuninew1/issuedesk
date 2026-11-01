const SOCIAL_RETURN_KEY = "issuedesk_social_return";

export function loginDestination(from, user) {
    if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !from.includes("\\") && ![...from].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
        return from;
    }
    return user.role === "admin" ? "/dashboard" : "/";
}

export function saveSocialReturn(from) {
    try {
        sessionStorage.setItem(SOCIAL_RETURN_KEY, typeof from === "string" ? from : "");
    } catch {
        // Storage may be unavailable; sign-in still works with the default destination.
    }
}

export function readSocialReturn() {
    try {
        return sessionStorage.getItem(SOCIAL_RETURN_KEY);
    } catch {
        return null;
    }
}

export function consumeSocialReturn() {
    try {
        const from = sessionStorage.getItem(SOCIAL_RETURN_KEY);
        sessionStorage.removeItem(SOCIAL_RETURN_KEY);
        return from;
    } catch {
        return null;
    }
}

const encoder = new TextEncoder();
export const GRANT_TTL_MS = 45_000;

function encode(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value) {
    return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (character) => character.charCodeAt(0));
}

export function httpsOrigin(value) {
    if (!value) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" && value === url.origin ? url.origin : null;
    } catch {
        return null;
    }
}

export async function grantKey(secret) {
    if (!/^[a-f0-9]{64}$/i.test(secret ?? "")) return null;
    const bytes = Uint8Array.from(secret.match(/../g), (pair) => Number.parseInt(pair, 16));
    return crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function issueGrant(key, origin, audience) {
    const payload = encode(encoder.encode(JSON.stringify({
        id: crypto.randomUUID(), origin, audience, expiresAt: Date.now() + GRANT_TTL_MS,
    })));
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return `${payload}.${encode(new Uint8Array(signature))}`;
}

export async function verifyGrant(key, token, origin, audience) {
    if (typeof token !== "string" || token.length > 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) return null;
    try {
        const [payload, signature] = token.split(".");
        if (!await crypto.subtle.verify("HMAC", key, decode(signature), encoder.encode(payload))) return null;
        const grant = JSON.parse(new TextDecoder().decode(decode(payload)));
        const now = Date.now();
        return grant.origin === origin && grant.audience === audience &&
            /^[a-f0-9-]{36}$/.test(grant.id) && Number.isSafeInteger(grant.expiresAt) &&
            grant.expiresAt > now && grant.expiresAt <= now + GRANT_TTL_MS + 5_000 ? grant : null;
    } catch {
        return null;
    }
}

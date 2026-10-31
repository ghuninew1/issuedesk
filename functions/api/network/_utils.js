import { jsonResponse } from "../auth/_utils.js";

export const DEFAULT_AGENT_ID = "qnap-agent";
export const DEFAULT_STALE_SECONDS = 90;
export const MAX_REPORT_BYTES = 128 * 1024;

export function staleAfterSeconds(env) {
    const configured = Number(env.NETWORK_AGENT_STALE_SECONDS);
    return Number.isInteger(configured) ? Math.max(30, Math.min(900, configured)) : DEFAULT_STALE_SECONDS;
}

export function serverError(error, label) {
    console.error(label, error);
    return jsonResponse({ success: false, message: "Unable to process network monitoring request" }, 500);
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maxLength) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function nonNegativeSafeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0;
}

function nullableIp(value) {
    return value === null || value === undefined || (typeof value === "string" && value.length <= 45);
}

export function validateSnapshot(payload, now = new Date()) {
    if (!isRecord(payload) || !isRecord(payload.router) || !isRecord(payload.wan)) {
        return { error: "Expected router and wan objects" };
    }

    const { router, wan } = payload;
    const collected = typeof payload.collectedAt === "string" ? new Date(payload.collectedAt) : null;
    if (!collected || Number.isNaN(collected.getTime()) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i.test(payload.collectedAt)) {
        return { error: "collectedAt must be an ISO 8601 timestamp with a timezone" };
    }
    if (collected.getTime() > now.getTime() + 60_000) return { error: "collectedAt cannot be in the future" };

    if (!boundedString(router.identity, 80) || !boundedString(router.uptime, 80)) {
        return { error: "router.identity and router.uptime are required" };
    }
    if (typeof router.cpuLoad !== "number" || !Number.isFinite(router.cpuLoad) || router.cpuLoad < 0 || router.cpuLoad > 100) {
        return { error: "router.cpuLoad must be between 0 and 100" };
    }
    if (!nonNegativeSafeInteger(router.memoryTotalBytes) || router.memoryTotalBytes === 0 ||
        !nonNegativeSafeInteger(router.memoryFreeBytes) || router.memoryFreeBytes > router.memoryTotalBytes) {
        return { error: "router memory values are invalid" };
    }
    if (router.temperatureC !== null && router.temperatureC !== undefined &&
        (typeof router.temperatureC !== "number" || !Number.isFinite(router.temperatureC) || router.temperatureC < -40 || router.temperatureC > 150)) {
        return { error: "router.temperatureC must be between -40 and 150, or null" };
    }

    const leases = payload.dhcpLeases;
    const leaseFields = { address: 45, macAddress: 32, hostName: 80, status: 32, server: 64 };
    if (leases != null && (!isRecord(leases) || !nonNegativeSafeInteger(leases.total) ||
        !Array.isArray(leases.items) || leases.items.length > 100 || leases.items.length > leases.total ||
        leases.items.some((item) => !isRecord(item) || Object.entries(leaseFields).some(([key, max]) =>
            typeof item[key] !== "string" || item[key].length > max)))) {
        return { error: "Invalid DHCP leases" };
    }
    const lanPorts = payload.lanPorts;
    if (lanPorts != null && (!isRecord(lanPorts) || !nonNegativeSafeInteger(lanPorts.total) ||
        !Array.isArray(lanPorts.items) || lanPorts.items.length > 100 || lanPorts.items.length > lanPorts.total ||
        lanPorts.items.some((item) => !isRecord(item) || !boundedString(item.bridge, 64) || !boundedString(item.interface, 64)))) {
        return { error: "Invalid LAN bridge ports" };
    }
    const wanKeys = ["ais", "true"];
    for (const key of wanKeys) {
        const item = wan[key];
        if (!isRecord(item) || !boundedString(item.interface, 64) || typeof item.running !== "boolean" ||
            !nonNegativeSafeInteger(item.rxBytes) || !nonNegativeSafeInteger(item.txBytes) || !nullableIp(item.ipAddress) ||
            (item.uptime != null && !boundedString(item.uptime, 80))) {
            return { error: `wan.${key} has invalid interface or counter values` };
        }
    }

    return {
        snapshot: {
            collectedAt: collected.toISOString(),
            router: {
                identity: router.identity.trim(),
                uptime: router.uptime.trim(),
                cpuLoad: router.cpuLoad,
                memoryTotalBytes: router.memoryTotalBytes,
                memoryFreeBytes: router.memoryFreeBytes,
                temperatureC: router.temperatureC ?? null,
            },
            dhcpLeases: leases ?? null,
            lanPorts: lanPorts ?? null,
            wan: Object.fromEntries(wanKeys.map((key) => [key, {
                interface: wan[key].interface.trim(),
                running: wan[key].running,
                ipAddress: wan[key].ipAddress ?? null,
                uptime: wan[key].uptime ?? null,
                rxBytes: wan[key].rxBytes,
                txBytes: wan[key].txBytes,
            }])),
        },
    };
}

export function toSnapshotRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        agentId: row.agent_id,
        collectedAt: row.collected_at,
        receivedAt: row.received_at,
        router: {
            identity: row.router_identity,
            uptime: row.router_uptime,
            cpuLoad: Number(row.cpu_load),
            memoryTotalBytes: Number(row.memory_total_bytes),
            memoryFreeBytes: Number(row.memory_free_bytes),
            temperatureC: row.temperature_c === null ? null : Number(row.temperature_c),
        },
        wan: {
            ais: { interface: row.ais_interface, running: Boolean(row.ais_running), ipAddress: row.ais_ip_address, uptime: row.ais_uptime ?? null, rxBytes: Number(row.ais_rx_bytes), txBytes: Number(row.ais_tx_bytes) },
            true: { interface: row.true_interface, running: Boolean(row.true_running), ipAddress: row.true_ip_address, uptime: row.true_uptime ?? null, rxBytes: Number(row.true_rx_bytes), txBytes: Number(row.true_tx_bytes) },
        },
    };
}

export async function authorizeAgent(request, env) {
    const expected = env.NETWORK_AGENT_TOKEN;
    if (typeof expected !== "string" || expected.length < 32) {
        return jsonResponse({ success: false, message: "Network agent is not configured" }, 503);
    }
    const authorization = request.headers.get("Authorization") || "";
    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) return jsonResponse({ success: false, message: "Agent authentication required" }, 401);

    const encoder = new TextEncoder();
    const [expectedHash, actualHash] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(expected)),
        crypto.subtle.digest("SHA-256", encoder.encode(match[1])),
    ]);
    const left = new Uint8Array(expectedHash);
    const right = new Uint8Array(actualHash);
    let mismatch = 0;
    for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
    if (mismatch !== 0) return jsonResponse({ success: false, message: "Invalid agent token" }, 401);
    return null;
}

export function requestIsTooLarge(request) {
    const length = Number(request.headers.get("Content-Length"));
    return Number.isFinite(length) && length > MAX_REPORT_BYTES;
}

export async function readLimitedBody(request) {
    if (!request.body) return "";
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REPORT_BYTES) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
}

export { jsonResponse };

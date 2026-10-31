# Network Monitoring API

All dashboard endpoints require an active IssueDesk session with role `admin`. Responses are JSON with `Cache-Control: no-store`.

## Agent report

`POST /api/network/agent/report` uses `Authorization: Bearer <agent token>` and `Content-Type: application/json`. Configure the token as the Cloudflare Pages secret `NETWORK_AGENT_TOKEN`; its value must contain at least 32 characters. The token is compared without logging it and is never stored in D1.

Example payload:

```json
{
  "collectedAt": "2026-10-25T05:00:00.000Z",
  "router": {
    "identity": "MKT-Bigbrain",
    "uptime": "12d 14h 32m",
    "cpuLoad": 12,
    "memoryTotalBytes": 4294967296,
    "memoryFreeBytes": 2650800128,
    "temperatureC": 42
  },
  "wan": {
    "ais": { "interface": "pppoe-AIS", "running": true, "ipAddress": null, "rxBytes": 123456789, "txBytes": 45678901 },
    "true": { "interface": "pppoe-TRUE", "running": true, "ipAddress": null, "rxBytes": 223456789, "txBytes": 55678901 }
  }
}
```

`collectedAt` must be an ISO 8601 timestamp with timezone and cannot be over one minute in the future. Payloads are limited to 128 KiB. Optional `wan.ais.uptime` and `wan.true.uptime` are nullable strings. Optional `dhcpLeases` is null or `{ "total": number, "items": [...] }`, with up to 100 items containing `address`, `macAddress`, `hostName`, `status`, and `server`. Only the latest list is stored in agent state and returned by status; leases are not proof that a device is online. Counters are non-negative safe integers; the API stores raw counters and does not infer Internet reachability or calculate rates. A repeated `(agent, collectedAt)` returns `409`.

Successful response (`201`): `{ "success": true, "receivedAt": "...", "snapshotId": "..." }`.

## On-demand collection

The Agent only reads the Router and submits snapshots while at least one Admin has the Network Monitor page open. The page maintains a 90-second viewer lease by calling `POST /api/network/viewers` with a per-tab UUID every 30 seconds; it sends `DELETE /api/network/viewers` when leaving. Expired leases are ignored, so a closed tab or browser crash stops collection within 90 seconds.

The Agent calls `GET /api/network/agent/control` every 30 seconds using the same Access Service Token headers and API Bearer token as the report endpoint. The response is `{ "success": true, "active": true|false, "pollIntervalSeconds": 30 }`. A control endpoint error fails closed: the Agent does not poll the Router or send snapshots until it can confirm an active viewer.

The idle Agent remains running in QNAP Docker and makes one small control request per polling interval. Router API reads, snapshot writes, and report requests stop when there are no active viewer leases.

## On-demand IP ping

- `POST /api/network/ping/check` is Admin-only and accepts `{ "targets": ["192.168.11.20", "192.168.11.21"] }`. It queues 1–20 unique addresses for the known `192.168.11.0/24` LAN and returns `202` with a `checkId`. A previously saved IP is rejected with `409`; for an explicit recheck, include `"recheck": true`.
- `GET /api/network/ping/check?id=<checkId>` is Admin-only and returns the queued/running/completed state, per-check results, and the latest result/check time for every saved IP. Without `id`, it returns the latest check and the same saved IP list.
- `DELETE /api/network/ping/check?ip=<address>` is Admin-only and removes that IP's result from all checks. Deletion is rejected while that IP is part of a pending/running check.
- `GET /api/network/agent/control` includes a claimed `pingJob` when work is queued. The QNAP Agent sends one ICMP echo request per target concurrently.
- `POST /api/network/agent/ping-report` uses the Agent Bearer token and Zero Trust Service Token to submit `online`, `offline` (no ICMP reply), or `error` plus `latencyMs` for successful replies.

The Agent runs checks only after an Admin explicitly presses **Check Ping** or **Recheck**. Only `192.168.11.1`–`192.168.11.254` are accepted; targets outside that LAN are rejected. A device that filters ICMP may be online but appear as not responding. Results include the timestamp of the latest check and are retained for 30 days unless an Admin deletes an IP.

## Admin dashboard

- `GET /api/network/status` returns the latest snapshot and agent heartbeat state. `agent.online` is calculated from the last heartbeat and the stale threshold (default 90 seconds; optional Pages variable `NETWORK_AGENT_STALE_SECONDS`, clamped to 30–900).
- `GET /api/network/history?hours=24&limit=3000` returns snapshots within the requested window. `hours` is 1–720; `limit` is 1–5000.
- `GET /api/network/events?limit=100` returns WAN interface transitions and agent online/recovery events. `limit` is 1–500.

The API retains snapshots for 30 days and events for 90 days, with cleanup throttled to once per day while reports arrive. PPPoE `running` is reported as interface state only; it does not mean that public Internet reachability was tested. WAN transitions are derived only from interface state changes between snapshots.

## Database setup

Migration `0007_create_network_monitoring.sql` adds the snapshots, current heartbeat pointer, event tables, indexes, and uniqueness constraint. Migration `0008_create_network_monitor_viewers.sql` adds expiring per-tab viewer leases for on-demand collection. Migration `0009_create_network_ping_checks.sql` adds queued ping checks and per-address results. Check the remote target and current D1 migration state before applying pending migrations. No database or secret is created by the API code itself.

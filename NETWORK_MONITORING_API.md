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

`collectedAt` must be an ISO 8601 timestamp with timezone and cannot be over one minute in the future. Payloads are limited to 32 KiB. Counters are non-negative safe integers; the API stores raw counters and does not infer Internet reachability or calculate rates. A repeated `(agent, collectedAt)` returns `409`.

Successful response (`201`): `{ "success": true, "receivedAt": "...", "snapshotId": "..." }`.

## Admin dashboard

- `GET /api/network/status` returns the latest snapshot and agent heartbeat state. `agent.online` is calculated from the last heartbeat and the stale threshold (default 90 seconds; optional Pages variable `NETWORK_AGENT_STALE_SECONDS`, clamped to 30–900).
- `GET /api/network/history?hours=24&limit=3000` returns snapshots within the requested window. `hours` is 1–720; `limit` is 1–5000.
- `GET /api/network/events?limit=100` returns WAN interface transitions and agent online/recovery events. `limit` is 1–500.

The API retains snapshots for 30 days and events for 90 days, with cleanup throttled to once per day while reports arrive. PPPoE `running` is reported as interface state only; it does not mean that public Internet reachability was tested. WAN transitions are derived only from interface state changes between snapshots.

## Database setup

Migration `0007_create_network_monitoring.sql` adds the snapshots, current heartbeat pointer, event tables, indexes, and uniqueness constraint. Check the remote target and current D1 migration state before applying it. No database or secret is created by the API code itself.

# IssueDesk Network Monitor Agent

This container connects outbound to the MikroTik RouterOS API-SSL, reads router and PPPoE counters, then posts snapshots to IssueDesk. It does not listen on a port, use SSH, change RouterOS settings, or test public Internet reachability. TLS certificate-chain and hostname verification stay enabled; the configured TLS server name is used for SNI and certificate checks.

The Agent uses Python's standard library only. The Docker image installs the system CA bundle required to verify the RouterOS certificate. The Compose service, network, `.env` file, and `/app/data` volume are already present in `garage/docker-compose.yml`; this implementation does not require persistent state in the volume.

## Configure on QNAP

1. Copy the repository to QNAP and open the directory that contains `docker-compose.yml` (the `garage` directory). Do not use the project root as the Compose working directory.
2. If the local Agent settings file does not already exist, create it from the example. Keep an existing `.env` and its local settings:

   ```sh
   if [ ! -f network-monitor/.env ]; then cp network-monitor/.env.example network-monitor/.env; fi
   ```

3. Edit `network-monitor/.env` on QNAP. Fill in `ROUTER_PASSWORD`, `ISSUEDESK_API_URL` with the deployed site's HTTPS origin (no path or trailing slash), and `ISSUEDESK_AGENT_TOKEN`. Generate the token locally (for example, `openssl rand -hex 32`), then set the same value in Cloudflare Pages and the QNAP `.env`. Do not send either secret in chat or commit `.env`.
4. Set Cloudflare Pages secret `NETWORK_AGENT_TOKEN` to the same high-entropy token. The current API rejects tokens shorter than 32 characters. Ensure migration `0007_create_network_monitoring.sql` is applied and the API deployment includes `/api/network/agent/report` before starting the Agent.
5. Build and start only this Compose service from the `garage` directory:

   ```sh
   docker compose -f docker-compose.yml build network-monitor
   docker compose -f docker-compose.yml up -d --no-deps network-monitor
   docker compose -f docker-compose.yml logs -f --tail=100 network-monitor
   ```

These commands are instructions for the QNAP operator; they are not run as part of creating these files.

## Settings

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ROUTER_HOST` | No | `192.168.11.1` | Router address reachable from QNAP |
| `ROUTER_API_PORT` | No | `8886` | RouterOS API-SSL port |
| `ROUTER_TLS_SERVER_NAME` | Yes | — | Certificate hostname/SNI, `e3210e5c5b67.sn.mynetname.net` |
| `ROUTER_USERNAME` | No | `issuedesk-monitor` | Existing read-only API account |
| `ROUTER_PASSWORD` | Yes | — | Router password, supplied locally on QNAP |
| `ISSUEDESK_API_URL` | Yes | — | HTTPS origin for the deployed IssueDesk site |
| `ISSUEDESK_AGENT_TOKEN` | Yes | — | Same high-entropy value as Pages secret `NETWORK_AGENT_TOKEN` |
| `POLL_INTERVAL_SECONDS` | No | `30` | Poll period, allowed range 5–3600 seconds |
| `ROUTER_TIMEOUT_SECONDS` | No | `10` | Router connect/read timeout, allowed range 1–60 seconds |
| `ISSUEDESK_REQUEST_TIMEOUT_SECONDS` | No | `10` | HTTP timeout, allowed range 1–60 seconds |
| `MAX_SEND_ATTEMPTS` | No | `5` | Bounded retry attempts for transient API failures |
| `LOG_LEVEL` | No | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL` |
| `TZ` | No | `Asia/Bangkok` | Container log timezone; payload timestamps use UTC |

The Container connects to `192.168.11.1:8886` and verifies the certificate against `ROUTER_TLS_SERVER_NAME`. Do not change the certificate verification behavior to work around a TLS error; check QNAP's CA bundle, DNS name, router certificate, and system time instead.

## Data contract

The Agent posts to `POST /api/network/agent/report` with `Authorization: Bearer <ISSUEDESK_AGENT_TOKEN>`. The JSON fields match `NETWORK_MONITORING_API.md`: `collectedAt`, `router.identity`, `router.uptime`, `router.cpuLoad`, `router.memoryTotalBytes`, `router.memoryFreeBytes`, optional `router.temperatureC`, and `wan.ais`/`wan.true` interface state plus RX/TX byte counters.

The API accepts raw counters, not rate fields. The Agent calculates per-WAN download/upload rates locally for safe diagnostics, while the Dashboard derives rates from saved snapshots. A counter reset or down interface produces `n/a` locally; it never produces a negative rate. PPPoE `running` reports interface state only and is not presented as Internet reachability.

`201` means the snapshot was saved. `409` means the same snapshot timestamp was already saved (for example, the response was lost and the Agent retried); the Agent treats it as delivered. Authentication or validation `4xx` responses are logged without the token and retried on the next polling cycle. Transient connection, timeout, throttling, and server errors receive bounded exponential backoff; a failed cycle does not stop future polling.

## Logs and troubleshooting

The Agent logs to stdout/stderr for Docker. It never logs router passwords, Agent tokens, Authorization headers, or response bodies. TLS verification, login, and HTTP errors have distinct messages without secret values.

- **TLS verification error:** confirm the router certificate chain and SAN include the configured TLS server name, QNAP time is correct, and the image CA bundle is current.
- **Router API read/authentication failure:** confirm API-SSL is enabled on port 8886, the monitoring user has `read,api`, and its allowed source includes the QNAP LAN address.
- **IssueDesk 401:** check that the `.env` token exactly matches Cloudflare Pages secret `NETWORK_AGENT_TOKEN` and is at least 32 characters.
- **IssueDesk 503:** configure the Pages secret before reporting.
- **No Dashboard data:** check the migration and deployment, then confirm a successful snapshot log and a recent timestamp at `/api/network/status` as an Admin.

The offline unit tests use in-memory sample counters and a mocked HTTP response; they do not contact the router or IssueDesk. After building the image, run them from `garage` on QNAP (this mounts only the test folder into a one-off container):

```sh
docker compose -f docker-compose.yml run --rm --no-deps \
  -v ./network-monitor/tests:/app/tests:ro \
  network-monitor python -m unittest discover -s /app/tests -v
```

No Router or Docker integration test was run while preparing these files. The first live connection and TLS handshake must be verified from QNAP after local secrets and the API deployment are ready.

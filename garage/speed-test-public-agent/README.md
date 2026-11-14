# Public Speed Test Agent prototype

This separate service implements the [Client Internet endpoint contract](../../docs/network/CLIENT_INTERNET_SPEED_TEST.md).
The existing LibreSpeed worker connects directly over HTTPS. The Agent uses the
Internet grant key from IssueDesk and never needs session cookies or D1 access.
The LAN entry point and its private-IP/CIDR validation use their existing settings.

## Local setup

Use Node.js 22+ and an isolated test certificate and key. For a native test,
pass these settings to `node garage/speed-test-public-agent/server.mjs` from the
repository root. Keep the private key and the grant key outside source control.

| Setting | Purpose |
| --- | --- |
| `SPEED_TEST_INTERNET_ISSUEDESK_ORIGIN` | Exact allowed IssueDesk HTTPS origin |
| `SPEED_TEST_INTERNET_ORIGIN` | Exact, distinct HTTPS audience for this Agent |
| `SPEED_TEST_INTERNET_GRANT_KEY` | Separate 32-byte random hex key shared with the Internet grant API |
| `SPEED_TEST_INTERNET_TLS_CERT`, `SPEED_TEST_INTERNET_TLS_KEY` | Native paths to certificate and key |
| `SPEED_TEST_INTERNET_BIND`, `SPEED_TEST_INTERNET_PORT` | Native listen address, defaults to `127.0.0.1:8443` |

For Docker testing, supply the settings in `.env.example` to the separate
Compose project. Point `SPEED_TEST_INTERNET_TLS_DIR` at a directory containing
`fullchain.pem` and `privkey.pem`, readable by the container's non-root user.
In this directory run `docker compose config --quiet`, then
`docker compose up --build` on an isolated machine. Published ports bind to
loopback only. If the chosen port is occupied, choose another local port and
adjust the Agent audience to match. Keep both systems' clocks synchronized.

Run the regression tests from the repository root with Node.js and OpenSSL.

```sh
node --test scripts/speed-test-checks.mjs scripts/speed-test-internet-checks.mjs scripts/speed-test-public-agent-checks.mjs
```

## Limits and cancellation

- `/ready` is a grant-free CORS capability probe, capped at 60 successful
  requests per global one-minute window. It describes service availability,
  not whether a test slot or grant is currently available.
- An admitted grant reserves the only active test until expiry and until its
  transfers close. A different grant or socket peer cannot take over the
  reservation. The Agent admits up to 10 tests in a rolling 24-hour window.
- One process allows up to 16 connections and three active transfers. Each
  grant allows 16 pings and 256 transfer requests, with 4 MiB per request and
  384 MiB reserved per direction. Concurrent requests reserve their full
  bytes before data is sent or consumed. Interrupted transfers keep their
  charge and release their transfer slot when the response closes.
- Requests have a six-second hard deadline after headers and transfers stop by
  grant expiry. Browser Cancel closes the measurement requests. It does not
  revoke the grant or immediately free the test reservation. HTTPS connections
  also have bounded header, TLS handshake, and idle time.
- Download data is random and held in memory. Uploads are discarded as they
  arrive. Responses use `Cache-Control: no-store`; the Agent does not compress
  responses and rejects compressed or chunked upload bodies.

## Before approving a VPS deployment

Review provider ingress and egress policies and any billing cap, certificate
management, the public TLS entry point, and ingress limits for untrusted
connections and requests, including rejected attempts. The in-memory quota
resets on restart and is independent per process. Run exactly one instance for
the pilot and enforce a durable provider-side budget for any hard billing cap.
Measurements count application bytes, excluding TLS, HTTP, and network
overhead. If placing an approved proxy in front, prevent redirects, disable
its compression, cache and buffering, and verify disconnects propagate to the
Agent. Behind a proxy the Agent sees the proxy peer address; do not use
forwarded headers to override the observed peer. Validate trusted TLS, CORS,
limits and throughput on an authorized staging origin before any rollout.

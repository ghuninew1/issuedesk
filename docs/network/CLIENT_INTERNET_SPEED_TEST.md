# Client Internet Speed Test pilot

Internet Test measures the current browser's path to one authorized public
HTTPS origin. The existing Server Test tab still measures the browser's path
to the LAN Agent. The two tabs have separate targets, grants, and results.
The browser sends measurement traffic directly to the configured endpoint.
IssueDesk Pages only validates the session, checks configuration and quotas,
and issues the signed grant.

## Endpoint decision

No authorized public origin was identified for this pilot. Use a dedicated origin
on a test VM or service the team operates, or obtain explicit operator permission
and a documented traffic allowance from a provider. LibreSpeed's software license
does not establish permission to run tests against community-operated endpoints.
The existing worker is pinned at LibreSpeed v6.3.1; see the
[worker notices](../../public/vendor/librespeed/NOTICE.md) and
[upstream backend guidance](https://github.com/librespeed/speedtest/blob/v6.3.1/doc.md).
The [Public Agent prototype](../../garage/speed-test-public-agent/README.md) implements
this contract for local testing. Public ingress, provider budget controls, and
the approved VPS deployment plan are separate acceptance steps.

## Public endpoint contract

- Serve a dedicated HTTPS origin with a trusted certificate. Use the exact
  IssueDesk origin for CORS. When permitted, preflight must allow the relevant
  method and `Authorization`, `Content-Type`, and `Content-Encoding` headers.
  Keep routes direct and avoid redirects, caching, compression, and upload buffering.
- `GET /ready` returns an empty `204` with `X-IssueDesk-Speed-Test: 1` and exposes
  that header via CORS, only while the service is accepting tests. It sends no
  measurement bytes and requires no browser grant. Rate-limit it separately.
  The browser checks it when entering the Internet tab. It reports availability,
  not guaranteed capacity or an end-to-end test.
- Authenticate `GET /ping`, `GET /download`, and `POST /upload` (including
  LibreSpeed cache-busting query strings). Verify the existing HMAC-SHA256 grant
  format with an Internet-only key. Require the exact IssueDesk origin, dedicated
  endpoint audience, and valid expiry before accepting payloads. The grant lasts
  at most 45 seconds, with synchronized clocks. CORS and Origin filtering are
  supplemental to grant validation. Never log bearer tokens or IssueDesk cookies.
- Return an empty `204` for successful ping and upload. Download returns
  `200` and non-compressible binary data. The worker uploads 4 MiB per request,
  uses one measurement stream per direction, and polls results over the existing
  worker interface. Set a 4 MiB per-request limit, a hard deadline, a bounded
  connection count, ping limits, and cumulative per-grant bytes in each direction.
  Reserve bytes before transferring even when a transfer is cancelled or retried.
  Reject exhausted budgets with `429` and the CORS headers. Apply aggregate egress
  and ingress caps plus ingress request limits at the public service; the IssueDesk
  grant quota alone cannot control direct network traffic or old grants.
- Suggested pilot ceiling is 384 MiB per direction per grant, as used for the
  LAN regression fixture. At 10 grants/day this allows at most 3.75 GiB of
  outgoing measurement payload plus 3.75 GiB incoming, before protocol overhead.
  Price depends on host, region and traffic. Set an approved billing/egress budget
  and validate actual counters before use. A fast link can hit the cap during
  the measurement and yield a limit error instead of a result.

## IssueDesk configuration and acceptance

Use a dedicated test environment. Keep the page's existing
`VITE_SPEED_TEST_LAN_ENABLED` build gate. For Internet only, set the following
runtime configuration after endpoint ownership/permission and budget are approved.

| Variable | Purpose |
| --- | --- |
| `SPEED_TEST_INTERNET_ENABLED` | Explicit opt-in, defaults off |
| `SPEED_TEST_INTERNET_ORIGIN` | Exact HTTPS origin, different from IssueDesk and the LAN Agent |
| `SPEED_TEST_INTERNET_GRANT_KEY` | Separate 32-byte random hex secret shared with the authorized endpoint |

Apply `0014_speed_test_internet_admissions.sql` to the test D1 before enabling.
It stores recent admission timestamps and Admin IDs for an atomic quota of
one grant per Admin per rolling minute and 10 total grants per rolling 24 hours.
Rows outside the window are pruned on subsequent admission. Results are not
stored. Cancel and failed transport attempts still consume a successfully issued
grant. The browser cancels its transfers or times out at 18 seconds. The public
endpoint must independently stop streams at its own deadline or grant expiry.

Before opening the pilot, validate a real browser against the approved origin
with normal TLS and exact CORS. Verify that no payload traverses Pages, the endpoint
rejects missing, expired and wrong-audience credentials, concurrent traffic respects
caps, cancel stops transfers, and retries/429s disclose no grant. Confirm that the
tabs retain distinct measurements and that outgoing bandwidth/cost remains within
the approved limit. Disable the Internet flag to stop further grant issuance;
previously issued grants expire naturally. LAN remains available under its own settings.

`node --test scripts/speed-test-checks.mjs scripts/speed-test-internet-checks.mjs`
uses local HTTPS and SQLite fixtures. The browser PoC uses separate loopback origins.
No public speed-test service is contacted during those checks.

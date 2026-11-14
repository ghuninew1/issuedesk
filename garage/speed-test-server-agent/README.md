# Server Internet Speed Test prototype

The Admin-only Server Internet Test tab queues a job in IssueDesk D1. A dedicated
Ubuntu runner polls the same-origin Pages control API over HTTPS and runs
LibreSpeed CLI against one operator-approved target. The CLI sends measurement
traffic directly to that target. Pages stores just the current/latest job and its
sanitized result. LAN keeps its existing path; Client Internet is Coming Soon
in the dashboard and its runtime flag should stay off.

## CLI and target

Use upstream **LibreSpeed CLI v1.0.14** (LGPL v3). Obtain the archive matching
the runner OS/architecture from the [release](https://github.com/librespeed/speedtest-cli/releases/tag/v1.0.14).
Check it against the release checksums before extracting. The runner verifies the
reported version. If distributing an image containing the CLI, include the license
notices and make the corresponding source available as required by the license.
The repository does not redistribute a CLI binary.

Provide one dedicated HTTPS backend operated by your team or a provider that
explicitly permits these tests and documents its traffic allowance. Keep the URL,
name and measurement paths in the runner's environment. The command uses a fixed
argument array and `--local-json - --server 1` with no shell. It avoids public
discovery, ICMP, sharing, and telemetry. The CLI does call its configured
`getIP` path even during unattended runs. If you control that endpoint, return
minimal JSON and disable IP/ISP enrichment. IssueDesk only receives rounded
Mbps/ms results and the configured server name from the CLI JSON.

The backend must implement the v1.0.14 protocol, including empty HTTP 200 on its
ping path and a JSON-compatible getIP response. The Phase 2A.1 Public Agent
requires a browser grant, uses 204 ping and does not supply getIP, so it is not
a compatible CLI target as implemented. No authorized public target has been
selected. Do not use the default community server list without operator approval.

## Isolated test setup

- Apply `0015_speed_test_server_job.sql` in test D1 only. In the test Pages
  environment set `SPEED_TEST_SERVER_ENABLED=true` and an independent
  `SPEED_TEST_SERVER_AGENT_TOKEN` (64 hex characters). The browser route uses
  the existing Speed Test build gate. Copy the runner's `.env.example` for your
  isolated test. Its token must match the test API. Keep
  `SPEED_TEST_SERVER_TARGET_APPROVED=false` until the target is authorized.
  Optional `SPEED_TEST_SERVER_ACCESS_CLIENT_ID` and
  `SPEED_TEST_SERVER_ACCESS_CLIENT_SECRET` are for an existing Cloudflare
  Access policy. They are separate from the Agent API token.
- For Docker, place the verified matching Linux binary at `librespeed-cli`
  beside the Dockerfile. Build and run the separate Compose project on your
  approved test host. It needs outbound HTTPS only, has no published ports,
  runs non-root with a read-only filesystem, and uses CPU, memory and PID limits.
  No privileged network mode, router access, or mounts from LAN/Storage.
- Configure test-host egress to permit only the approved target and IssueDesk
  control API. The unmodified upstream CLI's HTTP client follows redirects.
  Require direct endpoints with no redirects, and enforce the egress restriction
  outside the CLI. Verify valid TLS, rate limits and a provider-side byte budget.
  The sample is three seconds per direction with one stream and 1 MiB upload
  requests. This bounds test duration and concurrency; it is not a fixed
  outbound byte ceiling. CLI HTTP errors can influence estimates, so verify
  backend behavior and caps during public acceptance. No DNS, VPS or firewall
  changes are part of the local prototype.

## Lifecycle and validation

Start and Cancel use Admin sessions and same-origin checks. Status is visible
to the Admin who started the job. The runner authenticates separately using its
Bearer token and claims the only slot atomically. It polls every two seconds
and stops the CLI on Cancel, loss of control, or the local 40-second execution
deadline. A terminating child receives SIGTERM and then SIGKILL after 750 ms.
Run output is capped at 32 KiB and CLI stderr is not forwarded. The lease is
held for up to 60 seconds after claim, including when the runner disappears.
Restarted runners only claim queued work. They do not retry an abandoned lease.
Run one dedicated Compose service. Docker contains children if the service dies;
a native process killed abruptly outside that boundary is not a deployment target.

```sh
node --test scripts/speed-test-server-agent-checks.mjs
SPEED_TEST_CLI_FIXTURE_BIN=/absolute/path/to/librespeed-cli node --test scripts/speed-test-server-agent-checks.mjs
```

The optional real CLI case requires OpenSSL and exercises the pinned executable,
a local HTTPS backend, completion through SQLite-backed API fixtures, and process
cancellation. It sends no measurement traffic to third parties.

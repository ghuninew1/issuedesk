# IssueDesk LAN Speed Test PoC

`/speed-test` measures from the current browser to a separate HTTPS Agent on Ubuntu.
The browser reports download/upload Mbps and HTTP latency/jitter in ms.
The test result lives in the page. The Agent holds its current reservation in memory.
Pages issues a short-lived signed grant and the browser sends it directly to the Agent
as an Authorization header. Test data is generated and discarded in memory.

## Test-only setup

1. Use an isolated Ubuntu Linux host and a test client on the intended LAN. Choose
   a private IPv4 bind address and a client CIDR, allow port 8443 only from that
   subnet in the **test host firewall**, and configure a private DNS record
   resolving to the Agent. Keep the port off public ingress and Cloudflare Tunnel.
2. Supply a TLS certificate with the Agent hostname in its SAN and a chain trusted
   by the test browsers. For Compose, place `fullchain.pem` and `privkey.pem` in
   `SPEED_TEST_TLS_DIR` outside the checkout. Give the container's `node` user
   read access via the test host's file permissions. Keep the private key restricted.
3. Copy `.env.example` to `.env` inside this directory. Fill in the exact HTTPS
   origins (scheme, hostname and port, without a slash or path). Generate a
   dedicated random secret with `openssl rand -hex 32` using the test operator's
   secure workflow. Set it in the Agent and in the test Pages Function only.
4. For the **test build**, set `VITE_SPEED_TEST_LAN_ENABLED=true`. In the matching
   test Pages Functions environment set `SPEED_TEST_LAN_ENABLED=true`,
   `SPEED_TEST_AGENT_ORIGIN` and the secret `SPEED_TEST_GRANT_KEY`. Both flags
   default to off. Use a test IssueDesk Admin session and its existing auth store.
5. From this directory on the isolated Ubuntu host, use
   `docker compose config --quiet` then `docker compose up --build`.
   The Compose file uses Linux host networking to retain the client socket IP
   for the CIDR check. It binds only the configured IPv4 and has CPU, memory and
   PID limits. For a native comparison run `node garage/speed-test-agent/server.mjs`
   from the repository root with the same environment, plus
   `SPEED_TEST_TLS_CERT` and `SPEED_TEST_TLS_KEY` pointing to the test certificate.
   Run the native and Compose variants sequentially on the same port.

These steps are for an authorized test environment. An existing production deployment,
container, router or DNS policy needs separate approval before any change.

## Browser and resource checks on Ubuntu

- Open the exact test IssueDesk HTTPS origin in Chrome/Edge, Firefox and Safari
  where supported. Test Admin access, Local Network Access allow and deny, a
  trusted and an untrusted certificate, and the configured CORS origin versus a
  second origin. In DevTools verify that `/ping`, `/download` and `/upload`
  reach the private Agent address and send no IssueDesk cookie.
- Run downloads/uploads over wired LAN before Wi-Fi. Record browser version,
  NIC/link speed, client and host CPU, memory, and endpoint/port. Repeat across
  **native HTTPS** and **Compose host-network HTTPS** with identical settings.
  Use an independently authorized test-only HTTP vs HTTPS reference benchmark
  to estimate TLS overhead. This Agent only listens over HTTPS. If evaluating
  bridge/NAT too, verify the Agent still sees the true peer IP before comparing.
- Try two admins and cancellation while transferring. A second grant receives
  409 while the Agent's current grant is reserved. Cancel stops browser traffic.
  The reservation naturally expires within 45 seconds of issue, even after
  completion or cancel. Closely spaced tests may have to wait. Keep both systems'
  clocks synchronized.
- The PoC caps each request at 4 MiB, reserves at most 384 MiB per direction per
  grant, permits 16 pings and 3 simultaneous transfers, and uses a 6-second
  server request deadline and 18-second browser deadline. The worker uses one
  transfer stream per direction and a roughly 2-second sample window excluding
  warm-up. A sufficiently fast link can hit the byte budget; the page reports
  a traffic limit without publishing a result. Treat Mbps as application payload
  throughput and latency/jitter as LibreSpeed HTTP estimates, which are sensitive
  to browser timer granularity and TLS/connection setup.
- The Admin-issued bearer is valid for a short window and is bound to the exact
  browser origin and Agent audience. The Agent uses the real socket peer, not
  forwarded headers. Origin checks complement bearer verification. The reservation
  applies to one Agent process and disappears on restart; use a single instance
  for this PoC. Avoid reverse-proxy logging of Authorization headers.

## Baseline and local checks

The measurement worker is LibreSpeed **v6.3.1** (LGPL v3), pinned by commit.
[Source and notices](../../public/vendor/librespeed/NOTICE.md) ship with the worker.
The PoC uses only ping, download and upload. IP lookup, sharing and telemetry are disabled.

Run `node --test scripts/speed-test-checks.mjs` from the repository root with
Node.js and OpenSSL. The tests use temporary certificates, HTTPS loopback and
an auth fixture. They do not establish production or Ubuntu behavior.

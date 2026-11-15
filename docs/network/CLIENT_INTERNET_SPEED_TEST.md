# Client Internet Speed Test

Open `/speed-test` and select **Client Internet Test** as an Admin. The existing
`VITE_SPEED_TEST_LAN_ENABLED=true` build flag exposes the page. **Server Test**
continues to measure the LAN path from the browser to the
[Ubuntu LAN Agent](../../garage/speed-test-agent/README.md) for signed-in users.

## Measurement

The browser lazy-loads [`@cloudflare/speedtest`](https://github.com/cloudflare/speedtest)
(1.17.0, MIT) on Start and connects directly to `speed.cloudflare.com`. The
dashboard updates when the engine produces samples and displays the final
download and upload in Mbps, plus idle HTTP latency and jitter in ms. Missing
measurements stay blank. Test results live in the page for the current visit.

The engine uses timed HTTP transfers and reports a percentile across usable
samples. It estimates performance on the path to Cloudflare and may undershoot
peak link capacity. Browser timing precision, routing, VPNs and competing
traffic affect results. Latency is measured over HTTP. The test schedules up to
66.6 MB of download and upload payloads combined, plus protocol overhead and any
retries. Latency has a 20-request sample set. IssueDesk stops the run after
60 seconds or on Cancel or navigation away. Only one test can run at a time on
the page. The Cloudflare measurement service has no published request quota in
the library documentation. IssueDesk handles rate-limit responses and keeps
each run finite. See [Cloudflare's measurement methodology](https://blog.cloudflare.com/how-does-cloudflares-speed-test-really-work/).

## Network information and privacy

- Public IP, ASN organization (shown as ISP), estimated city and country come
  from inbound [Cloudflare request metadata](https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties)
  and [CF-Connecting-IP](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip).
  The Admin-only Pages Function reads metadata on the IssueDesk request and
  returns it with `Cache-Control: no-store`. It uses the existing Pages service
  terms and plan limits. No separate geolocation dataset, license, token, or
  cross-origin API is needed. On the Free plan the request counts toward the
  [shared Pages Functions and Workers quota](https://developers.cloudflare.com/pages/functions/pricing/).
- The Cloudflare server code comes from a separate
  [trace request](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/)
  to the measurement origin after the test. That code identifies the edge
  that answered the trace. Cloudflare anycast routing can vary between requests.
  The metadata requests time out after five seconds. Unavailable values are
  shown as dashes, with successful measurement results kept visible.
- Cloudflare sees the public IP and the measurement requests under its
  [Speed Test privacy notice](https://speed.cloudflare.com/) and
  [Privacy Policy](https://www.cloudflare.com/privacypolicy/). The client omits
  credentials on the trace request and disables the engine's result and
  measurement-log submissions. IssueDesk does not persist the metadata or test
  results. IP geolocation and ASN ownership reflect the connection's egress
  and may describe a VPN, proxy or carrier.

## Local checks

```sh
node --test scripts/speed-test-checks.mjs scripts/speed-test-network-checks.mjs
VITE_SPEED_TEST_LAN_ENABLED=true pnpm build
```

The API tests use local authentication and edge metadata fixtures. Live Pages
metadata and real LAN Agent connectivity require a deployed environment and
a browser on the intended network.

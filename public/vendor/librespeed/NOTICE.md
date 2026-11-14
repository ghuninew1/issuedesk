LibreSpeed measurement worker by Federico Dossena and contributors, GNU LGPL v3.
Source baseline: https://github.com/librespeed/speedtest/tree/a820d7cdf1fea13592809966ba845e68efff7ef9 (v6.3.1).

IssueDesk changes, 2026-11-15: add a bearer header to download, upload and ping;
fail download/ping on non-success HTTP responses; expose an HTTP 429 limit
flag; omit the grant from diagnostic
output. The adjacent JavaScript is the complete, editable source of the worker
delivered by IssueDesk. See LICENSE and GPL-3.0.txt.

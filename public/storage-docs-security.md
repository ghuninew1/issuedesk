# Security and Credentials

## Secret Handling

The real `storage/.env` must never be committed to Git.

Treat these values as secrets:

- `STORAGE_ADMIN_TOKEN`
- `STORAGE_API_TOKEN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- Per-app credential secrets

Do not paste secrets into documentation, chat, screenshots, logs,
or source files.

## Admin Token

`STORAGE_ADMIN_TOKEN` protects all `/admin/*` routes.

If the variable is missing, admin requests return HTTP `503`.

Restrict access to this token and use it only from trusted administrative
environments.

## App Credentials

The admin API generates a random 32-byte secret encoded as base64url.

Only its SHA-256 hash is stored in SQLite. The plaintext secret is
returned at issuance time and cannot be retrieved later.

A credential is accepted only when:

- Its status is active.
- Its owning application is active.
- Its optional expiry has not passed.

The current issuance endpoint does not accept an expiry value, so
credentials issued through that endpoint do not expire automatically.

Revoke a credential using:

`DELETE /admin/credentials/:credentialId`

## Project Isolation

V2 queries verify both the requested project ID and the authenticated
application ID.

A credential belonging to one application cannot use V2 endpoints
to access another application's project.

Use a separate credential for each integrating application.

## Legacy API

`STORAGE_API_TOKEN` is required by the current startup validation even
when the legacy API is disabled.

The legacy `/api/*` middleware returns HTTP `404` unless
`ENABLE_LEGACY_API` is exactly `true`.

Prefer V2 endpoints for new integrations.

## Network Security

The Docker ports bind to `192.168.11.32`, but firewall, VPN, router,
and tunnel settings must also be reviewed.

Do not expose Garage port `3900` directly to the public internet.

If remote access is needed, use an intentional HTTPS and access-control
design.

A Cloudflare Pages Function normally cannot reach the QNAP private
address directly. Establish secure connectivity before connecting a
public Pages deployment.

Never place app credentials, admin tokens, or S3 credentials in browser
JavaScript.
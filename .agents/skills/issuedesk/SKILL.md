---
name: issuedesk
description: Work on the IssueDesk help desk application, including its React interface, Cloudflare Pages API, D1 data, authentication, attendance, and file storage. Use when changing or investigating this repository.
---

# IssueDesk project guide

Use this skill for changes in the IssueDesk repository. First inspect the relevant source and current Git diff; repository documentation can lag behind code. Keep changes within the user's requested scope.

## Project map

- `src/`: React 19, React Router 7, Tailwind CSS v4 UI.
- `functions/api/`: Cloudflare Pages Functions endpoints.
- `migrations/`: ordered SQLite migrations for Cloudflare D1.
- `wrangler.jsonc`: Pages configuration and D1 binding (`DB`).
- `src/services/` and `src/utils/api.js`: browser-side API helpers.
- `PROJECT_HANDOFF.md`, `README.md`, and `STORAGE_DOCS_*.md`: useful orientation; confirm details in code when behavior matters.

Use `pnpm` for package commands. Available scripts include `pnpm dev`, `pnpm lint`, `pnpm build`, and `pnpm preview`. `pnpm dev` serves the Vite frontend; use the configured Pages/Wrangler workflow when a task needs Functions or D1 behavior.

## Domain rules to preserve

- Public reporters can create tickets and track a ticket. The public tracking endpoint must expose only the fields needed for status and timeline; do not return reporter or issue details.
- Admin-only operations must check authorization in the Pages Function as well as the UI route. Use the shared helpers in `functions/api/auth/_utils.js` (`getSessionUser`, `requireRole`, and, where relevant, `isSameOrigin`). Never rely on a client-side guard as API security.
- Attendance records belong to the authenticated session user. Derive user identity and timestamps on the server, not from request fields. Work dates use `Asia/Bangkok`; stored timestamps are UTC. Current schema supports one record per user per day and does not automatically close records left working from a previous day.
- Ticket numbers use the `IT-YYYYMM-NNNN` format based on `Asia/Bangkok` time. Ticket statuses are `Open`, `In Progress`, and `Resolved`.
- Attachments and managed files use the external Storage API; D1 stores metadata. Keep Storage credentials and server secrets in the server environment. Browser requests should go through the same-origin API helpers, not call the Storage service directly.
- Google Sheets inventory is fetched by the browser. `VITE_*` values are bundled into client code; never put secrets or data there that must remain private.

## Data and operational changes

- For schema changes, add a new ordered migration under `migrations/`; do not rewrite an already-applied migration as a way to update a database.
- Treat remote D1, Cloudflare secrets/settings, Storage, email, and deployment as external systems. Inspect the target and current state before any operation that changes them. Do not apply remote migrations, bootstrap an admin, or deploy unless the user requested that operation.
- Do not read or reproduce values from `.env`, `.dev.vars`, `garage/.env`, `garage/storage/.env`, or credential files. These are local configuration and must not be committed. Refer to `.env.example` or `.dev.vars.example` for variable names when present.
- Ticket email delivery is best effort: a mail failure should not silently turn successful ticket creation into failure unless the requested behavior explicitly changes this contract.

## Working on a feature

Trace the existing flow across page/component, service/helper, Pages Function, and migration as applicable. Follow established patterns and keep validation and error responses consistent with neighboring endpoints. When changing permissions or data returned by an endpoint, review both the API and its UI consumers. Consult the relevant storage documentation for Storage API changes.

For visible UI actions, use the existing `src/components/GlassButton.jsx` instead of a raw `<button>`. Keep native buttons for non-visual click targets such as full-screen backdrops.

Run lint, build, or other checks when the user requests verification or when needed to substantiate a reported result. Do not claim remote behavior, migration state, or deployment success based only on local source or a successful frontend build.

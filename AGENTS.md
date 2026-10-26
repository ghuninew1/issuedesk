
# AGENTS.md — IssueDesk

## Scope and Sources of Truth
- These instructions apply throughout this repository, including `src/`, `functions/`, `garage/`, and `scripts/`, unless a more specific `AGENTS.md` adds instructions for its directory.
- Confirm current behavior in source, schemas, and configuration. Documentation and example settings describe intended setup; they do not prove that a remote service, secret, or migration is configured.
- Treat `package.json`, `pnpm-lock.yaml`, `vite.config.js`, and `wrangler.jsonc` as the sources of truth for dependencies, build behavior, and Cloudflare bindings. Do not hard-code assumptions from an older dependency version.

## Project Overview
- IssueDesk is an IT support and issue-tracking application.
- Preserve the existing React 19, React Router 7, Vite, Tailwind CSS v4, and Cloudflare Pages architecture.
- The browser application is in `src/`; API routes are Cloudflare Pages Functions in `functions/api/`.
- Cloudflare D1 is used for application data. Ordered SQLite migrations live in `migrations/`.
- `garage/` contains supporting Storage and Network Monitor services and their operational documentation. Treat these as part of the project when a task touches them.
- Browser-side API helpers are in `src/utils/api.js` and `src/services/`; shared class composition is provided by `src/utils/cx.js`.
- Inspect the existing implementation and relevant documentation before making changes. Do not assume undocumented behavior.

## Project Map
- `src/App.jsx` defines routes and lazy-loaded pages; `src/auth/` owns browser session state and route guards.
- `src/components/`, `src/pages/`, `src/hooks/`, and `src/theme/` contain the UI; shared styles and Tailwind theme tokens are in `src/index.css`.
- `functions/api/` contains ticket, auth/OAuth, attendance, storage proxy, and network endpoints. These run in the Cloudflare runtime, not a Node.js server.
- `wrangler.jsonc` configures Pages output (`dist/`) and the D1 binding `DB` for `issuedesk-db`.
- `garage/storage/` is a separate Node.js/Hono service using `better-sqlite3` for its own metadata and Garage's S3-compatible API for objects. Its SQLite database is separate from Cloudflare D1.
- `garage/network-monitor/` is the Python agent for MikroTik RouterOS monitoring and requested LAN ping checks; its tests are in `garage/network-monitor/tests/`.
- `garage/docker-compose.yml` defines the supporting containers. `scripts/bootstrap-admin.py` is an operational admin-creation tool, not a routine validation command.
- Consult `README.md` and `PROJECT_HANDOFF.md` for orientation, `STORAGE_README.md` and `STORAGE_DOCS_*.md` for Storage, and `NETWORK_MONITORING_API.md` plus `garage/network-monitor/README_NETWORK_MONITOR.md` for networking. Verify operational details against code.

## Working Principles
- Preserve the existing project structure, UI, and behavior unless the task requires a change.
- Prefer small, focused changes over unnecessary rewrites.
- Do not replace working implementations simply to introduce a different pattern.
- Reuse existing components, hooks, utilities, and API conventions.
- Do not invent user information, application requirements, environment variables, or API behavior.
- Identify risks and explain important trade-offs before making substantial changes.

## Tech Stack and Conventions
- Use pnpm for package management and scripts.
- Use React with the existing JSX and component conventions.
- Use Tailwind CSS v4 and the existing CSS variables and theme system.
- Every JSX `className` prop must use the project's `cx()` helper, including static classes (for example, `className={cx("...")}`).
- Compose conditional and multiple classes by passing them to `cx()`; do not use template literals, string concatenation, or inline conditional expressions directly in `className`.
- For a callback-style `className` such as a React Router `NavLink`, return `cx(...)` from the callback.
- `cx()` filters falsy arguments and joins the remaining arguments with spaces. Pass strings and falsy values (for example, `cx("base", active && "active", disabled ? "disabled" : "enabled")`); it does not flatten arrays, support object maps, or merge conflicting Tailwind utilities.
- Use `src/utils/cx.js` for this rule even though `src/lib/utils.js` also exports `cn`. Existing components do not all comply yet; their older patterns are not exceptions for new changes.
- When editing a component, bring any `className` props touched by the change into compliance with the `cx()` rule. Avoid unrelated bulk rewrites.
- Follow the existing dark theme conventions and preserve light/dark behavior.
- Keep class names statically discoverable by Tailwind where possible; do not construct utility class fragments dynamically.
- Keep components readable and separated according to existing project patterns.
- Prefer existing dependencies over adding new ones.
- Ask before adding dependencies that are not clearly necessary.

## Project-Specific Behavior
- Preserve public ticket reporting and tracking behavior. Public tracking responses must expose only the fields needed for status and timeline, not reporter or issue details.
- Enforce admin authorization in the Pages Function as well as in the UI. Reuse `functions/api/auth/_utils.js` helpers (`getSessionUser`, `requireRole`, and, where appropriate, `isSameOrigin`); a client-side route guard is not API authorization.
- Attendance belongs to the authenticated session user. Derive identity and timestamps on the server. Work dates use `Asia/Bangkok`, while stored timestamps are UTC. The current schema allows one record per user per day and does not automatically close a record left working from a prior day.
- Ticket numbers use `IT-YYYYMM-NNNN` based on `Asia/Bangkok` time. Ticket statuses are `Open`, `In Progress`, and `Resolved`.
- Attachments and managed files use the external Storage API; D1 stores metadata. Route browser calls through same-origin API helpers and keep Storage credentials and other server secrets out of browser code.
- Google Sheets inventory is fetched by the browser. Treat `VITE_*` values as public because they are bundled into client code; do not place secrets or private data in them.
- Ticket email delivery is best effort. Preserve successful ticket creation if email delivery fails unless the requested change explicitly alters this behavior.

## Authentication and Access
- Public routes include reporting and ticket tracking. Attendance and Sheets require a session; dashboard, issue management, Storage images, and Network Monitor require the admin role. Check `src/App.jsx` and the relevant API when changing access.
- Preserve the server-managed session contract: `issuedesk_session` is an HttpOnly, Secure, SameSite=Lax cookie; D1 stores the token hash rather than the raw session token. Do not move session tokens into browser storage or expose them through JSON responses.
- Keep same-origin checks on browser mutation endpoints and retain authentication rate limits. Agent endpoints use their separate bearer-token contract rather than browser sessions.
- Registration creates ordinary `user` accounts. Do not accept a client-supplied admin role or bypass inactive-user checks.
- Google and Facebook OAuth require provider configuration. Preserve OAuth state-cookie validation and existing account-linking checks; do not imply that providers work merely because their routes exist.

## Network Monitoring
- Preserve collection on demand: the admin page renews a per-tab viewer lease every 30 seconds, with a 90-second expiry. The agent checks the control endpoint and pauses Router reads and snapshot reports when no lease is active; control failures must fail closed.
- Keep RouterOS monitoring read-only and preserve TLS certificate and hostname verification. Agent API bearer credentials and Cloudflare Access Service Token credentials have separate purposes; do not replace one with the other or expose either to the browser.
- WAN `running` describes interface state, not verified public Internet access. Preserve raw counters, rate derivation, stale-heartbeat handling, and existing data-retention behavior when changing reports or charts.
- Ping runs only on an explicit admin request through the existing queue/agent/report flow. Preserve the 1–20 unique target limit and current allowlist (`192.168.11.1`–`192.168.11.254`); do not broaden it or add automatic probing without a requested behavior change.
- Preserve duplicate/recheck handling, pending-job protections, and cleanup of page polling timers and viewer leases.

## Frontend
- Follow a mobile-first responsive design approach.
- Use `src/components/GlassButton.jsx` for UI buttons so hover and active feedback comes from `glassHover` in `src/utils/utils.js`. Keep native buttons for non-visual click targets such as full-screen backdrops.
- Preserve existing routing, authentication, and authorization behavior.
- Reuse existing UI components and shared utilities.
- Avoid unnecessary state updates, repeated requests, and expensive rendering.
- Lazy-load or defer expensive content when appropriate.
- Do not load asset images until needed when the existing page uses deferred image rendering.
- Maintain accessibility, keyboard interaction, and loading/error states.
- Preserve route-level lazy loading and clean up timers, listeners, object URLs, and body-scroll locks introduced by effects.
- When changing file uploads, check both browser validation and server/storage limits, including existing HEIC/HEIF conversion and preview cleanup.
- Follow the current CSS-based Tailwind v4 setup. `components.json` contains shadcn configuration, but it does not prove that generated UI components or every configured import alias exist in the runtime bundler; inspect actual files and Vite configuration before using them.

## Backend and Database
- Follow existing Cloudflare Pages Functions API conventions.
- Preserve authentication, session handling, authorization, and input validation.
- Use the existing D1 schema and migration workflow.
- For schema changes, add a new ordered migration under `migrations/`; do not rewrite an already-applied migration to change a database.
- Do not modify production data or apply database migrations without explicit approval.
- Never expose API keys, secrets, session tokens, or sensitive environment variables.
- Keep API response formats compatible with existing frontend consumers unless a change is required.
- Use bound parameters for user-controlled SQL values, preserve server-side ownership checks, and follow neighboring response/error conventions. Keep private responses non-cacheable where the existing API uses `Cache-Control: no-store`.
- Treat remote D1, Cloudflare settings/secrets, Storage, email, and deployment as external systems. Inspect the target and current state before changes, and do not bootstrap an admin or perform operational changes unless requested.
- Do not read or reproduce values from `.env`, `.dev.vars`, `garage/.env`, `garage/storage/.env`, `garage/network-monitor/.env`, or credential files. Use example files such as `.env.example` and service-specific `.env.example` files to inspect variable names.
- Treat local service databases, SQLite WAL/SHM files, Garage object data, and persistent Docker volumes as application data. Do not edit, delete, reset, or commit them as part of code or documentation work.

## Commands
- Use `pnpm` for package management and scripts.
- `pnpm dev`: start the Vite frontend development server. Use the configured Pages/Wrangler workflow when exercising Functions or D1 behavior.
- `pnpm lint`: run ESLint.
- `pnpm build`: build the frontend into `dist/`.
- `pnpm preview`: build and run `wrangler pages dev`.
- `pnpm deploy`: build and deploy Cloudflare Pages; requires explicit user authorization.
- `pnpm cf-typegen`: generate Cloudflare types.
- `pnpm migrate`: list remote D1 migration status; `pnpm migrate-apply`: apply migrations to remote D1 and requires explicit user authorization.
- There is no root `test` script in `package.json`. Check for relevant service-specific tests before choosing validation commands.
- For Network Monitor agent changes, the existing unit suite can run from the repository root with `python3 -m unittest discover -s garage/network-monitor/tests -v`. Use the container-based command in the agent README when validation requires its system dependencies.
- Storage has its own `package.json`: `pnpm --dir garage/storage start` runs the Node service and `pnpm --dir garage/storage dev` runs it in watch mode. These start a service and may initialize its SQLite database; they are not read-only checks.
- Do not claim a build, test, deployment, remote migration, or production behavior succeeded unless it was actually verified.

## Validation
- Use `pnpm lint` during development when appropriate.
- Do not run `pnpm build` after every small change.
- Run `pnpm build` for significant changes and before deployment or production verification.
- Run relevant tests when available and appropriate.
- For documentation-only changes, review the content and `git diff --check`; lint/build are generally unnecessary unless the change also affects code or configuration.
- For UI changes, check affected interactions and mobile/light/dark states when relevant. A frontend build does not verify browser behavior, Pages Functions, remote D1, RouterOS, or Storage integration; report any unverified layer explicitly.
- Report commands actually executed and their results.
- Do not claim that a test or build passed unless it was actually run successfully.

## Git and Deployment
- Inspect the current Git status before making changes.
- Preserve unrelated user modifications.
- Do not discard, overwrite, or revert user work without approval.
- Do not commit, push, deploy, or change production infrastructure without explicit authorization.

## Task Workflow
1. Inspect the relevant files and existing implementation.
2. Explain the proposed approach for substantial or risky changes.
3. Make the smallest change that satisfies the request.
4. Review the diff for regressions and unintended changes.
5. Run appropriate validation.
6. Summarize changed files, validation results, and remaining concerns.

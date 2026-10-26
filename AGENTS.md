
# AGENTS.md — IssueDesk

## Project Overview
- IssueDesk is an IT support and issue-tracking application.
- Preserve the existing React 19, React Router 7, Vite, Tailwind CSS v4, and Cloudflare Pages architecture.
- The browser application is in `src/`; API routes are Cloudflare Pages Functions in `functions/api/`.
- Cloudflare D1 is used for application data. Ordered SQLite migrations live in `migrations/`.
- `garage/` contains supporting Storage and Network Monitor services and their operational documentation. Treat these as part of the project when a task touches them.
- Browser-side API helpers are in `src/utils/api.js` and `src/services/`; shared class composition is provided by `src/utils/cx.js`.
- Inspect the existing implementation and relevant documentation before making changes. Do not assume undocumented behavior.

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

## Frontend
- Follow a mobile-first responsive design approach.
- Preserve existing routing, authentication, and authorization behavior.
- Reuse existing UI components and shared utilities.
- Avoid unnecessary state updates, repeated requests, and expensive rendering.
- Lazy-load or defer expensive content when appropriate.
- Do not load asset images until needed when the existing page uses deferred image rendering.
- Maintain accessibility, keyboard interaction, and loading/error states.

## Backend and Database
- Follow existing Cloudflare Pages Functions API conventions.
- Preserve authentication, session handling, authorization, and input validation.
- Use the existing D1 schema and migration workflow.
- For schema changes, add a new ordered migration under `migrations/`; do not rewrite an already-applied migration to change a database.
- Do not modify production data or apply database migrations without explicit approval.
- Never expose API keys, secrets, session tokens, or sensitive environment variables.
- Keep API response formats compatible with existing frontend consumers unless a change is required.
- Treat remote D1, Cloudflare settings/secrets, Storage, email, and deployment as external systems. Inspect the target and current state before changes, and do not bootstrap an admin or perform operational changes unless requested.
- Do not read or reproduce values from `.env`, `.dev.vars`, `garage/.env`, `garage/storage/.env`, or credential files. Use example files such as `.env.example` and service-specific `.env.example` files to inspect variable names.

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
- Do not claim a build, test, deployment, remote migration, or production behavior succeeded unless it was actually verified.

## Validation
- Use `pnpm lint` during development when appropriate.
- Do not run `pnpm build` after every small change.
- Run `pnpm build` for significant changes and before deployment or production verification.
- Run relevant tests when available and appropriate.
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

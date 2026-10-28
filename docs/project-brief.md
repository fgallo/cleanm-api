# CleanM — Project Brief

Context handoff for planning and development sessions.
Source: planning conversation held on 2026-09-21. Update this file when a decision changes.

## 1. Product

CleanM (clean management) is a web system for residential cleaning businesses:
client management, scheduling, invoicing and revenue lookup.

- First user: one residential cleaning business in Toronto, Canada.
- Built generic from day one so it can be offered to other cleaning businesses later.
- The MVP comes first. Multi-tenant signup, plans and billing are out of scope for now.

### Repositories

Separate repositories, no monorepo, no shared package.

| Repo         | Purpose                                  | Status                               |
| ------------ | ---------------------------------------- | ------------------------------------ |
| `cleanm-api` | REST API (this repo)                     | in progress                          |
| `cleanm-web` | React web client                         | starts after the clients CRUD exists |
| `cleanm-ios` | Native iOS client, hand-written in Swift | later                                |

Naming pattern: `<product>-<platform>`, lowercase, hyphenated.
Local layout: all repos side by side under `~/Projects/cleanm/`.

## 2. MVP scope

### In

- Calendar with two views: month, and a more detailed week view.
- Per day, the list of jobs. Each job shows:
  - client: name, address, notes about the house
  - service type: regular, deep, move-in, move-out
  - helper assigned, if any
  - hourly rate, hours, price
  - payment: paid or not, method (e-transfer, cash)
  - whether an invoice was generated
  - job status
- Editing job details from the day view.
- Invoice generation (PDF).
- Revenue lookup: by month, paid vs outstanding.
- Authentication: two seeded admin users. No signup screen, roles or invitations.

### Out

Client portal, online payments, automated email, helper login, mobile app,
multi-tenant signup and billing.

## 3. Domain notes

- Recurring clients are weekly, biweekly or monthly.
- "Monthly" exists in two forms, both in use (confirmed with the business owner
  on 2026-10-01): every 4 weeks (13 visits per year) and a fixed day of the
  month, such as every 14th (12 visits per year). Recurrence must support both.
- Saturday and Sunday jobs happen occasionally. No special handling: a job is a date.
  A one-off weekend job is simply a job with no series.
- Recurrence: a `recurring_series` row (rule plus job template) materializes
  concrete job rows at least 8 weeks ahead, further when the calendar asks for
  a later date. Each job is then independently editable, and the owner does
  edit single visits often. No RRULE engine: two rules, every N weeks and day
  of month, computed by a pure function (`src/recurring-series/occurrences.ts`).
  - `generated_until` on the series makes generation idempotent; the
    generating statement only runs when that value is still what the caller
    saw, so concurrent requests cannot duplicate visits.
  - A change to the series template reaches its upcoming unrealized jobs
    field by field, only where the job still had the previous value, so
    hand-edited visits are kept.
  - The rule and the property never change: to change the rhythm, end the
    series (`end_date`, which removes unrealized visits after it) and create
    another. A series is deleted only while none of its visits happened.
- Invoicing: one invoice per visit, generated before or after it (a job that
  is `scheduled` or `completed`). The owner sometimes edits an invoice's date,
  line or amount after generating it, and the number stays (confirmed
  2026-10-16): no draft or void states.

## 4. Data model sketch

This is a map, not a spec. Tables are implemented one at a time, as each roadmap
step needs them. Migrations make schema changes cheap.

`organizations`, `users`, `clients`, `properties`, `helpers`, `jobs`,
`recurring_series`, `invoices`, `invoice_items`, `payments`

`properties` holds the address and house details, because one client can have
more than one property.

### Design rules

1. `organization_id` on every table from the first migration. This is the only
   multi-tenant concession made now. Foreign keys between tenant tables are
   composite, `(organization_id, x_id) REFERENCES x (organization_id, id)`, so
   the database itself refuses a row that points at another organization's
   data. Each referenced table gets a `UNIQUE (organization_id, id)`.
2. Job status is `estimated -> scheduled -> completed | cancelled`.
   "Modified" is an event, not a status: use `updated_at`, plus a `job_events`
   table if history is wanted.
3. Do not store "invoice generated" or "paid" booleans. Derive them: a job is
   invoiced if an invoice points at it (`invoices.job_id`, unique); an invoice
   is paid if its payments cover the total. Store `paid_on` (a calendar date:
   revenue is looked up by month) and `method` on payments. The same for a job's price: `fixed_price_cents` when a price was
   agreed, otherwise `hourly_rate_cents` × `duration_minutes` / 60, computed
   in the query.
4. Money as integer cents. Timestamps as `timestamptz` in UTC. The organization
   has a timezone field. A job's day and start time are `date` and `time`
   without time zone: a job is a slot on the organization's calendar, not an
   instant.
5. Invoices have a sequential number per organization, assigned at creation
   (`organizations.next_invoice_number`); a deleted invoice leaves a gap, and
   numbers are never reused. An invoice copies the pricing inputs of its job
   and the tax of the organization when it is created, and keeps its own copy
   from then on: the owner edits the invoice itself, and a later change to the
   job or to the tax settings never changes it. A discount is an amount or a
   share of the subtotal (basis points), never both; the tax applies to the
   discounted subtotal. Subtotal, discount, tax and total are derived from
   those columns in the query, like a job's price. Tax is
   configured per organization (rate and registration number), which covers
   both 13% HST in Ontario and businesses that are not registered.
6. Rows that other rows reference are never deleted in cascade (a property
   with jobs, later a job with an invoice): the API answers `409 conflict`, so
   history is kept. Where a row must still be retired, it gets a flag instead
   (`helpers.active`).

## 5. Stack

### Decided

- Node 24 pinned in `.nvmrc`, managed with nvm. TypeScript files run directly
  on Node (native type stripping), so there is no build step.
- TypeScript 6. Not 7 yet: `typescript-eslint` requires `typescript <6.1`.
- npm, with `package-lock.json` committed; `npm ci` to reproduce an install
- Express 5 for HTTP. Chosen over Fastify, Hono and NestJS for being the most
  used; validation and logging are added by hand when their steps arrive.
- ESLint (flat config, `typescript-eslint`) and Prettier. Chosen over Biome for
  being the market standard.
- PostgreSQL 18, installed with Homebrew for development. The production
  database is chosen at deploy time (roadmap step 6); migrations are the bridge.
- `pg` (node-postgres) with hand-written SQL and hand-written row types. Chosen
  over Drizzle, Prisma and Kysely to stay simple and close to SQL. TypeORM and
  MikroORM are not an option: decorators are not erasable syntax.
- Migrations are plain SQL files in `migrations/`, applied in name order by a
  small runner in `src/db/migrate.ts` that records them in `schema_migrations`.
  No `down` migrations, checksums or locks until they are needed;
  `node-pg-migrate` is the fallback.
- Primary keys are `uuid` generated with `uuidv7()` (PostgreSQL 18+):
  time-ordered, not enumerable, and clients can generate them offline later.
- Zod 4 for input validation. One schema per route body or params, the
  TypeScript type is inferred from it. Chosen over Valibot and hand-written
  checks: validation is boilerplate, not something worth writing by hand.
- Vitest 5 for tests. Chosen over `node:test`, Jest, Mocha and AVA for being
  the most used and for running TypeScript and ESM without configuration;
  `cleanm-web` will share it.
- Endpoint tests start the real app on a free port and call it with the native
  `fetch` (helper in `test/api.ts`). Chosen over supertest: the same HTTP round
  trip without a dependency.
- Tests run against a real PostgreSQL database, `cleanm_test`. Chosen over
  pg-mem and Testcontainers: the SQL is hand-written and uses PostgreSQL 18
  features, and Docker is dropped until deploy. Each test file creates its own
  organization, so files run in parallel on the same database.
- Authentication is hand-written (`src/auth/`): a `users` table, a `sessions`
  table holding the SHA-256 of a 256-bit random token, and that token in an
  `HttpOnly; SameSite=Lax; Secure` cookie. Chosen over Better Auth, Passport,
  Auth.js and hosted providers: for two admins without OAuth, a library costs
  more in integration (its own schema, routes, error shape and migrations)
  than it saves, and the boundary (`src/auth/session.ts`) keeps a later switch
  cheap. Lucia is deprecated and recommends this same design.
- Passwords are hashed with `node:crypto` scrypt (N = 2^17, r = 8, p = 1), in
  a self-describing `scrypt$N$r$p$salt$hash` string. Chosen over Node's
  `crypto.argon2` (experimental), native argon2 packages (a binary per
  platform) and bcryptjs (72-byte limit). Argon2id becomes the target once
  Node's API is stable: `needsRehash` re-hashes on the next sign-in.
- `helmet` for the standard security headers and `express-rate-limit` for
  sign-in attempts, by address and by email. Both are the most used; the
  counters live in memory until there is more than one process.
- `cors` for the web client's origin (`WEB_ORIGINS`, comma separated, with
  credentials so the session cookie travels). Chosen over hand-written
  headers (preflight, `Vary` and header echoing are easy to get subtly
  wrong) and over a proxy (the web client and the API will live on different
  hosts). Native apps need no CORS. `helmet`'s
  `Cross-Origin-Resource-Policy` is `same-site`, so the web client can embed
  the organization logo in an `<img>`.
- `pino` with `pino-http` for logs (decided 2026-10-27): one JSON line per
  request with method, path, status, duration, client address and a request
  id (also sent back as `X-Request-Id`), levels from `LOG_LEVEL`, and
  `redact` so passwords, cookies and authorization headers never reach a log
  line; `pino-pretty` makes the lines readable in a terminal. Chosen over
  `morgan` (text only, no levels or redaction), `winston` with
  `express-winston` (the HTTP middleware is little used) and a hand-written
  middleware (no dependency, but levels and redaction would be reinvented).
  Downloads per week: pino 37M, winston 17M, morgan 9M, pino-http 4M.
- The organization logo is uploaded as the raw request body
  (`PUT /organization/logo`, `express.raw`, PNG or JPEG up to 1 MB, file
  signature checked) and stored in PostgreSQL as `bytea`. Chosen over
  `multer` (multipart, meant for HTML forms; the clients are React and Swift
  sending a `File`), the server's disk (ephemeral on the deploy candidates)
  and object storage (another service for one small image per organization).
- Invoice PDFs are an HTML and CSS page (`src/invoices/pdf/template.ts`, the
  Inter font embedded) rendered by Chromium through `puppeteer`, on request
  and never stored. Decided on 2026-10-22 for the owner's priorities: logo,
  own fonts, and a layout that is easy to adjust (`npm run pdf:preview`
  writes a sample HTML and PDF). Chosen over `pdfmake` (declarative layout of
  its own, no preview), `pdfkit` (coordinates by hand), `@react-pdf/renderer`
  (JSX needs a build step), `pdf-lib` and `jspdf` (no text layout engine).
  The cost is Chromium in the deploy: ~170 MB in the image and 200 to 400 MB
  of memory while rendering, so the API service needs 1 GB. On Railway or
  Fly.io that is $1 to $3 a month more; on Render it means the $25 Standard
  instance instead of the $7 Starter.

### API conventions

- JSON bodies and responses, camelCase keys (`createdAt`); the SQL aliases
  snake_case columns to camelCase.
- Status codes: `201` create, `200` read and update, `204` delete, `400`
  invalid input or JSON, `401` no session or wrong credentials, `404` not
  found, `409` delete refused because other records still reference the row,
  `413` body above the limit, `415` body of a type the route does not take,
  `429` too many sign-in attempts, `500` unexpected, `503` the database
  cannot be reached (`GET /health` only).
- Errors always have the shape
  `{ "error": { "code", "message", "issues"?: [{ "path", "message" }] } }`
  with `code` in `validation_error`, `invalid_json`, `unauthorized`,
  `invalid_credentials`, `not_found`, `conflict`, `payload_too_large`,
  `unsupported_media_type`, `too_many_requests`, `internal_error`,
  `service_unavailable`. An id in
  the body that points at nothing (such as
  `propertyId` on `POST /jobs`) is a `validation_error` on that field.
- Partial updates use `PATCH`; a field set to `null` clears it.
- Child resources use shallow nesting: the collection lives under its parent
  (`/clients/:clientId/properties`, `404` when the parent does not exist) and a
  single item is addressed by its own id (`/properties/:id`). Chosen over fully
  nested and flat URLs: ids are globally unique, and a parent in the URL keeps
  `404` as the only answer for a parent that does not exist.
- The organization is the signed-in user's: `src/auth/session.ts` turns the
  session cookie into `res.locals.user` and `res.locals.organizationId`, and
  `requireSession` guards every route after `/health` and `/auth`. Routes and
  repositories only read `res.locals`, so that module is the only place to
  replace if the authentication mechanism ever changes.
  `npm run db:seed` creates the development organization and its two admins;
  `npm run db:seed:sample` fills it with invented clients, visits, invoices
  and payments placed around today (`src/db/sample-data.ts`, built through
  the repositories and services so it obeys the same rules as the API).
- Layers: `routes` (HTTP, validation, status codes) and `repository` (SQL,
  always filtered by `organization_id`). A `service` module holds business
  rules that span several queries; the first one is
  `src/recurring-series/service.ts`. Modules without such rules have no
  service.

### Proposed, not decided

Introduce each one only when its roadmap step arrives, and explain the
alternatives first.

- Give more alternatives than the ones below:
- Web: React, Vite, TanStack Query, Tailwind, shadcn/ui, FullCalendar
  (`dayGridMonth` and `timeGridWeek` match the two calendar views)
- Deploy: Cloudflare Pages for the web client; Railway, Render or Fly.io for
  the API and Postgres

### Dropped

- Generating a Swift client from an OpenAPI spec. The iOS client will be hand-written.
- Docker, until deploy.
- Drizzle ORM and drizzle-kit, in favour of `pg` with plain SQL (see Decided).

## 6. Roadmap

Vertical slices. Each step introduces one main concept and has a clear
definition of done.

1. **Minimal HTTP server.** `GET /health` returns `{"status":"ok"}`.
   Done when `npm run dev` starts the server, `curl localhost:3000/health`
   answers, and `npm run typecheck` and `npm run lint` pass.
   Follow-up PR: CI with GitHub Actions (`npm ci`, typecheck, lint; tests from step 4).
2. **Local PostgreSQL and first migration.** Tables `organizations` and `clients` only.
3. **Clients CRUD end to end.** Routes, service, repository, input validation,
   status codes.
4. **Endpoint tests.**
5. **Jobs and recurrence.**
6. **Authentication.** Nothing is deployed before this step.
7. **Invoices and revenue queries.**

## 7. Git workflow

- GitHub Flow: short-lived branch, pull request, `main`. No `develop` branch.
- Branch names follow the Conventional Commits prefixes:
  `feat/health-route`, `feat/clients-crud`, `chore/ci`, `fix/...`
- Conventional Commits. Small commits, one per concept.
- **The human performs every git write operation:** stage, commit, push, opening
  the pull request (on the GitHub web UI) and merging. The AI assistant never
  commits, pushes or opens pull requests. It may run read-only git commands
  (`status`, `diff`, `log`) and propose commit messages.
- Merge method: **Rebase and merge** only. Squash merging and merge commits are
  disabled in the repository settings, so every commit of a pull request lands
  on `main` individually, in a linear history.
- "Automatically delete head branches" is enabled.
- `main` is protected by a ruleset: require a pull request, require status
  checks to pass, zero required approvals. Enable it right after the initial
  scaffolding commit, which may go directly to `main`.
- Version tags (`v0.1.0`) start when there is a deploy.

## 8. Public repository rules

The repository is public for now. Anything that enters the history while it is
public must be treated as public forever.

1. No secrets in the repo. `.env` is ignored; `.env.example` carries fake values.
2. No real client data. Seeds, tests and screenshots use invented names and addresses.
3. The repository becomes private before the system goes to production with
   real data (roadmap step 6).

### Security checklist

What authentication already does, and what is still owed before each
milestone. The design (session cookie plus slow hash) is the one OWASP
recommends; what makes it safe is this list.

Done in step 6:

- Session token: 256 random bits, only its SHA-256 stored; new token on every
  sign-in; 30-day expiry; sign-out deletes the row; expired rows are purged.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`.
- Passwords: scrypt with OWASP parameters, constant-time comparison, minimum
  length 8 where a password is set, no other composition rules.
- Sign-in: one message for wrong email and wrong password, the same response
  time for both, at most 10 attempts per email and 100 per address in 15
  minutes.
- `helmet` headers. Tenant isolation by `organization_id` in every query and
  composite foreign keys in the database.

Done after step 7 (production readiness):

- `TRUST_PROXY` (number of proxies in front) is honoured, so `req.ip` and
  the sign-in rate limiter see the client behind the host's proxy, and a
  client cannot forge `X-Forwarded-For` when no proxy is trusted.
- Graceful shutdown on `SIGTERM` and `SIGINT`: stop listening, finish the
  requests in flight, close Chromium and the database pool, 10-second grace
  period.
- `GET /health` checks the database and answers `503` when it is unreachable,
  so a wrong `DATABASE_URL` fails the deploy's health check instead of
  passing silently.
- Dependabot version updates (`.github/dependabot.yml`): weekly, minor and
  patch updates grouped in one pull request, checked by CI.
- Request logging with `pino`: one line per request with a request id,
  `/health` left out, and passwords, cookies and authorization headers
  redacted wherever they would appear.

Before real data in production (deploy):

- Chromium in the API image (`puppeteer` downloads it on `npm ci`; the
  official `puppeteer` Docker image has the system libraries) and 1 GB of
  memory for the API service, for the invoice PDFs. Containers block the
  user namespaces Chromium's sandbox needs: set `CHROMIUM_NO_SANDBOX=true`
  there (the pages rendered are the API's own HTML, with every value
  escaped), or run the image with a seccomp profile that allows them.
- HTTPS only, `NODE_ENV=production`, `TRUST_PROXY=1` (one proxy in front on
  Railway, Render and Fly.io).
- The web client and the API under the same registrable domain
  (`app.example.ca` and `api.example.ca`): the session cookie is
  `SameSite=Lax`, which browsers only send to the same site, so the hosts'
  own subdomains (`*.pages.dev`, `*.up.railway.app`) would break sign-in.
  `WEB_ORIGINS` set to the web client's origin.
- Secrets only in the host's environment; database backups; this repository
  private.

Before the first external customer:

- Email verification and password reset (needs email sending, out of the
  MVP), change-password endpoint, 2FA, "sign out everywhere", account
  lockout, checks against breached-password lists, audit log of changes,
  data-handling policy (PIPEDA in Canada).
- Rate limiting with a shared store once there is more than one process.
- A professional penetration test before selling.

## 9. Claude Code setup

- Output style: Explanatory (`/config` -> Output style).
- Context7 MCP for up-to-date library documentation.
- Project permissions deny `git commit` and `git push` (see `.claude/settings.json`).
- No skills installed for now. Planned: grill-me before designing recurrence
  (step 5), Trail of Bits skills at authentication (step 6), webapp-testing when
  `cleanm-web` starts.
- Later: a PostToolUse hook running typecheck, lint and tests on changed files.

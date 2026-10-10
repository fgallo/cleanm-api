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
   invoiced if it has an `invoice_id`; an invoice is paid if its payments cover
   the total. Store `paid_at` and `method` on payments. The same for a job's
   price: `fixed_price_cents` when a price was agreed, otherwise
   `hourly_rate_cents` × `duration_minutes` / 60, computed in the query.
4. Money as integer cents. Timestamps as `timestamptz` in UTC. The organization
   has a timezone field. A job's day and start time are `date` and `time`
   without time zone: a job is a slot on the organization's calendar, not an
   instant.
5. Invoices keep a snapshot of the amounts, have a sequential number per
   organization, and are immutable once issued. Tax is configured per
   organization (rate and registration number), which covers both 13% HST in
   Ontario and businesses that are not registered.
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

### API conventions

- JSON bodies and responses, camelCase keys (`createdAt`); the SQL aliases
  snake_case columns to camelCase.
- Status codes: `201` create, `200` read and update, `204` delete, `400`
  invalid input or JSON, `401` no session or wrong credentials, `404` not
  found, `409` delete refused because other records still reference the row,
  `429` too many sign-in attempts, `500` unexpected.
- Errors always have the shape
  `{ "error": { "code", "message", "issues"?: [{ "path", "message" }] } }`
  with `code` in `validation_error`, `invalid_json`, `unauthorized`,
  `invalid_credentials`, `not_found`, `conflict`, `too_many_requests`,
  `internal_error`. An id in the body that points at nothing (such as
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
  `npm run db:seed` creates the development organization and its two admins.
- Layers: `routes` (HTTP, validation, status codes) and `repository` (SQL,
  always filtered by `organization_id`). A `service` module holds business
  rules that span several queries; the first one is
  `src/recurring-series/service.ts`. Modules without such rules have no
  service.

### Proposed, not decided

Introduce each one only when its roadmap step arrives, and explain the
alternatives first.

- Give more alternatives than the ones below:
- `@react-pdf/renderer` for invoice PDFs
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

Before real data in production (deploy):

- HTTPS only, `NODE_ENV=production`, `app.set("trust proxy", ...)` matching
  the host so rate limiting sees real addresses.
- Secrets only in the host's environment; database backups; this repository
  private; Dependabot version updates enabled.
- Logs never contain passwords, cookies or tokens.

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

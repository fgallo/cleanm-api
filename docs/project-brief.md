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

| Repo | Purpose | Status |
|---|---|---|
| `cleanm-api` | REST API (this repo) | in progress |
| `cleanm-web` | React web client | starts after the clients CRUD exists |
| `cleanm-ios` | Native iOS client, hand-written in Swift | later |

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
- Saturday and Sunday jobs happen occasionally. No special handling: a job is a date.
  A one-off weekend job is simply a job with no series.
- Planned approach for recurrence: a `recurring_series` row materializes concrete
  job rows about 8 weeks ahead. Each job is then independently editable.
  No RRULE engine in the MVP.
- **Open question:** does "monthly" mean every 4 weeks (13 visits per year) or a
  fixed position in the month, such as the first Tuesday (12 visits per year)?
  Confirm with the business owner before implementing recurrence.

## 4. Data model sketch

This is a map, not a spec. Tables are implemented one at a time, as each roadmap
step needs them. Migrations make schema changes cheap.

`organizations`, `users`, `clients`, `properties`, `helpers`, `jobs`,
`recurring_series`, `invoices`, `invoice_items`, `payments`

`properties` holds the address and house details, because one client can have
more than one property.

### Design rules

1. `organization_id` on every table from the first migration. This is the only
   multi-tenant concession made now.
2. Job status is `estimated -> scheduled -> completed | cancelled`.
   "Modified" is an event, not a status: use `updated_at`, plus a `job_events`
   table if history is wanted.
3. Do not store "invoice generated" or "paid" booleans. Derive them: a job is
   invoiced if it has an `invoice_id`; an invoice is paid if its payments cover
   the total. Store `paid_at` and `method` on payments.
4. Money as integer cents. Timestamps as `timestamptz` in UTC. The organization
   has a timezone field.
5. Invoices keep a snapshot of the amounts, have a sequential number per
   organization, and are immutable once issued. Tax is configured per
   organization (rate and registration number), which covers both 13% HST in
   Ontario and businesses that are not registered.

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

### Proposed, not decided

Introduce each one only when its roadmap step arrives, and explain the
alternatives first.

- Give more alternatives than the ones below:
- PostgreSQL, Drizzle ORM and drizzle-kit for migrations
- Zod for input validation
- Vitest for tests
- Better Auth for authentication
- `@react-pdf/renderer` for invoice PDFs
- Web: React, Vite, TanStack Query, Tailwind, shadcn/ui, FullCalendar
  (`dayGridMonth` and `timeGridWeek` match the two calendar views)
- Deploy: Cloudflare Pages for the web client; Railway, Render or Fly.io for
  the API and Postgres

### Dropped

- Generating a Swift client from an OpenAPI spec. The iOS client will be hand-written.
- Docker, until deploy.

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

## 9. Claude Code setup

- Output style: Explanatory (`/config` -> Output style).
- Context7 MCP for up-to-date library documentation.
- Project permissions deny `git commit` and `git push` (see `.claude/settings.json`).
- No skills installed for now. Planned: grill-me before designing recurrence
  (step 5), Trail of Bits skills at authentication (step 6), webapp-testing when
  `cleanm-web` starts.
- Later: a PostToolUse hook running typecheck, lint and tests on changed files.

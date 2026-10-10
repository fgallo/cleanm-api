# cleanm-api

REST API for CleanM: scheduling, client management and invoicing for residential cleaning businesses

## Getting started

Requires Node 24 and PostgreSQL 18. Node is pinned in `.nvmrc`, so with nvm:

```sh
nvm install
npm ci
```

Install PostgreSQL with Homebrew and create the development database:

```sh
brew install postgresql@18
echo 'export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"' >> ~/.zshrc
brew services start postgresql@18
createdb cleanm_dev
```

Configure the environment, apply the migrations, create the development
organization with its two admin users, and start the server:

```sh
cp .env.example .env   # then choose SEED_ADMIN_PASSWORD
npm run db:migrate
npm run db:seed        # creates ana@example.com and bruno@example.com
npm run dev
```

Then:

```sh
curl localhost:3000/health
# {"status":"ok"}
curl -c cookies.txt -X POST localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"ana@example.com","password":"<SEED_ADMIN_PASSWORD>"}'
# {"user":{...},"organization":{...}}
curl -b cookies.txt localhost:3000/clients
# []
```

Configuration comes from environment variables, loaded from `.env` when the
file exists (see `.env.example`): `PORT` (default `3000`), `DATABASE_URL` and
`SEED_ADMIN_PASSWORD` (only read by `npm run db:seed`). `NODE_ENV=production`
turns on what only works behind HTTPS, such as the `Secure` cookie flag.

## API

JSON in and out, camelCase keys. Errors always look like
`{ "error": { "code": "...", "message": "...", "issues": [...] } }`, where
`issues` (path and message per field) is present for `validation_error`.

| Method and path                      | Body                                      | Response                                    |
| ------------------------------------ | ----------------------------------------- | ------------------------------------------- |
| `GET /health`                        |                                           | `200`                                       |
| `POST /auth/login`                   | `{ email, password }`                     | `200` user and organization, `401` or `429` |
| `POST /auth/logout`                  |                                           | `204`                                       |
| `GET /auth/me`                       |                                           | `200` user and organization                 |
| `GET /clients`                       |                                           | `200` list                                  |
| `POST /clients`                      | `{ name, email?, phone? }`                | `201` client                                |
| `GET /clients/:id`                   |                                           | `200` or `404`                              |
| `PATCH /clients/:id`                 | any of `name`, `email`, `phone`           | `200` or `404`                              |
| `DELETE /clients/:id`                |                                           | `204` or `404`                              |
| `GET /clients/:clientId/properties`  |                                           | `200` list or `404`                         |
| `POST /clients/:clientId/properties` | property fields, see below                | `201` property or `404`                     |
| `GET /properties/:id`                |                                           | `200` or `404`                              |
| `PATCH /properties/:id`              | any of the property fields                | `200` or `404`                              |
| `DELETE /properties/:id`             |                                           | `204`, `404` or `409`                       |
| `GET /jobs?from=&to=`                |                                           | `200` list                                  |
| `POST /jobs`                         | job fields, see below                     | `201` job                                   |
| `GET /jobs/:id`                      |                                           | `200` or `404`                              |
| `PATCH /jobs/:id`                    | any of the job fields except `propertyId` | `200` or `404`                              |
| `DELETE /jobs/:id`                   |                                           | `204` or `404`                              |
| `GET /helpers`                       |                                           | `200` list                                  |
| `POST /helpers`                      | `{ name, phone? }`                        | `201` helper                                |
| `GET /helpers/:id`                   |                                           | `200` or `404`                              |
| `PATCH /helpers/:id`                 | any of `name`, `phone`, `active`          | `200` or `404`                              |
| `DELETE /helpers/:id`                |                                           | `204`, `404` or `409`                       |
| `GET /recurring-series`              |                                           | `200` list                                  |
| `POST /recurring-series`             | series fields, see below                  | `201` series                                |
| `GET /recurring-series/:id`          |                                           | `200` or `404`                              |
| `PATCH /recurring-series/:id`        | any of the job template fields, `endDate` | `200` or `404`                              |
| `DELETE /recurring-series/:id`       |                                           | `204`, `404` or `409`                       |

Every route except `/health` and `POST /auth/login` needs a signed-in user and
answers `401 unauthorized` without one. Signing in sets the `cleanm_session`
cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production), valid for 30
days; the user's organization is the one every other route serves. A wrong
email or password answers `401 invalid_credentials` with the same message for
both, and more than ten attempts on one email in fifteen minutes answers
`429 too_many_requests`. Signing out deletes the session.

In a `PATCH`, fields left out are unchanged and `null` clears a field.
Invalid input answers `400 validation_error`; a malformed body answers
`400 invalid_json`. Deleting something that other records still reference,
such as a client or a property with jobs, answers `409 conflict`: history is
never lost.

```sh
curl -X POST localhost:3000/clients \
  -H 'content-type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com"}'
# {"id":"...","name":"Jane Doe","email":"jane@example.com","phone":null,"createdAt":"...","updatedAt":"..."}
```

A property is an address where jobs happen, and it belongs to one client. The
collection is nested under the client (`404` when the client does not exist), a
single property is addressed by its own id, and deleting a client deletes its
properties (unless they have jobs). Property fields: `addressLine1`, `city`,
`province` and `postalCode` are required; `addressLine2`, `notes` and
`country` (two-letter code, default `CA`) are optional.

```sh
curl -X POST localhost:3000/clients/$CLIENT_ID/properties \
  -H 'content-type: application/json' \
  -d '{"addressLine1":"123 Example St","city":"Toronto","province":"ON","postalCode":"M5V 0A1"}'
# {"id":"...","clientId":"...","addressLine1":"123 Example St","addressLine2":null,"city":"Toronto","province":"ON","postalCode":"M5V 0A1","country":"CA","notes":null,"createdAt":"...","updatedAt":"..."}
```

A job is a visit to a property on a day of the organization's calendar. The
list takes an inclusive date range (`from` and `to` as `YYYY-MM-DD`), ordered
by date and time, and every job comes with its `property`, `client` and
`helper` (or `null`) embedded. Job fields: `propertyId`, `scheduledDate`
(`YYYY-MM-DD`), `startTime` (`HH:MM`), `durationMinutes`, `serviceType`
(`regular`, `deep`, `move_in`, `move_out`) and `hourlyRateCents` are required;
`status` (`estimated`, `scheduled`, `completed`, `cancelled`; default
`scheduled`), `fixedPriceCents`, `helperId` and `notes` are optional.
`priceCents` is derived: the fixed price when set, otherwise hourly rate ×
duration. A `propertyId` or `helperId` that does not exist, or a helper that
is not active, answers `400 validation_error` on that field. Jobs generated
by a recurring series carry its id in `recurringSeriesId`.

```sh
curl -X POST localhost:3000/jobs \
  -H 'content-type: application/json' \
  -d '{"propertyId":"'$PROPERTY_ID'","scheduledDate":"2026-10-14","startTime":"09:00","durationMinutes":150,"serviceType":"regular","hourlyRateCents":4500}'
# {"id":"...","scheduledDate":"2026-10-14","startTime":"09:00:00","durationMinutes":150,"serviceType":"regular","status":"scheduled","hourlyRateCents":4500,"fixedPriceCents":null,"priceCents":11250,"notes":null,"property":{...},"client":{"id":"...","name":"Jane Doe"},"helper":null,"createdAt":"...","updatedAt":"..."}
```

A helper is a person who does the cleaning and can be assigned to a job. A
helper with jobs cannot be deleted (`409`); one who left the business is
deactivated with `active: false` instead, which keeps the history and stops
new assignments. The list includes inactive helpers.

A recurring series creates the jobs of a recurring client ahead of time: at
least eight weeks ahead, or as far as the calendar asks for with
`GET /jobs?to=`. Series fields: `propertyId`, `startDate`, exactly one of
`everyWeeks` (1 for weekly, 2 for biweekly, 4 for every four weeks, on the
weekday of `startDate`) or `dayOfMonth` (1 to 31, the last day of shorter
months), the job template (`startTime`, `durationMinutes`, `serviceType`,
`hourlyRateCents`, `fixedPriceCents?`, `helperId?`, `notes?`) and an optional
`endDate`. The rule and the property cannot change: to change the rhythm, end
the series with `endDate` and create another one.

Each generated job is edited on its own with `PATCH /jobs/:id`, and the
series never overwrites that: a `PATCH` on the series changes, in its
upcoming jobs that are still `scheduled` or `estimated`, only the fields that
still had the series' previous value. Setting `endDate` removes the unrealized
visits after it; setting it back to `null` resumes generation. A series can be
deleted, together with its visits, only while none of them was completed or
cancelled; afterwards it answers `409` and `endDate` is the way to stop it.

```sh
curl -X POST localhost:3000/recurring-series \
  -H 'content-type: application/json' \
  -d '{"propertyId":"'$PROPERTY_ID'","everyWeeks":2,"startDate":"2026-10-13","startTime":"09:00","durationMinutes":150,"serviceType":"regular","hourlyRateCents":4500}'
# {"id":"...","everyWeeks":2,"dayOfMonth":null,"startDate":"2026-10-13","endDate":null,"generatedUntil":"...","startTime":"09:00:00",...,"property":{...},"client":{...},"helper":null,"createdAt":"...","updatedAt":"..."}
```

## Database

Migrations are plain SQL files in `migrations/`, named `NNNN_description.sql`
and applied in name order by `npm run db:migrate`. Applied names are recorded
in the `schema_migrations` table, so running the command again is a no-op.
Each file runs inside a transaction: if it fails, nothing from it is kept.

To add a migration, create the next numbered file and run `npm run db:migrate`.
There are no down migrations; to start over locally,
`dropdb cleanm_dev && createdb cleanm_dev`.

## Tests

Endpoint tests run with Vitest against a real PostgreSQL database, separate
from the development one. Create it once, then run the tests:

```sh
createdb cleanm_test
npm test
```

Each run applies pending migrations to the test database first. A test file
starts the app on a free port, with an organization and a signed-in user
created for that file, and calls it with `fetch` sending that session cookie;
each test starts with no clients. Nothing is read
from `.env`: the database is `postgres://localhost:5432/cleanm_test` unless
`TEST_DATABASE_URL` is set.

Tests live next to the code they cover, as `*.test.ts`. The shared test setup
is `test/api.ts`.

## Scripts

| Script               | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Starts the server and restarts it when a file changes     |
| `npm start`          | Starts the server once                                    |
| `npm run typecheck`  | Type-checks with `tsc`, no output files                   |
| `npm run lint`       | Runs ESLint and checks formatting with Prettier           |
| `npm run lint:fix`   | Fixes what ESLint can fix and formats files with Prettier |
| `npm test`           | Runs the tests once against the test database             |
| `npm run test:watch` | Runs the tests again when a file changes                  |
| `npm run db:migrate` | Applies pending SQL migrations to `DATABASE_URL`          |
| `npm run db:seed`    | Creates the development organization and prints its id    |

TypeScript runs directly on Node (native type stripping), so there is no build step.

Project context, scope and roadmap: [docs/project-brief.md](docs/project-brief.md).

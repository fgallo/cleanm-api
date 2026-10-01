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
organization and start the server:

```sh
cp .env.example .env
npm run db:migrate
npm run db:seed        # prints ORGANIZATION_ID=...; paste that line into .env
npm run dev
```

Then:

```sh
curl localhost:3000/health
# {"status":"ok"}
```

Configuration comes from environment variables, loaded from `.env` when the
file exists (see `.env.example`): `PORT` (default `3000`), `DATABASE_URL` and
`ORGANIZATION_ID`. The last one is a placeholder until authentication exists:
every request is served for that organization.

## API

JSON in and out, camelCase keys. Errors always look like
`{ "error": { "code": "...", "message": "...", "issues": [...] } }`, where
`issues` (path and message per field) is present for `validation_error`.

| Method and path                      | Body                            | Response                |
| ------------------------------------ | ------------------------------- | ----------------------- |
| `GET /health`                        |                                 | `200`                   |
| `GET /clients`                       |                                 | `200` list              |
| `POST /clients`                      | `{ name, email?, phone? }`      | `201` client            |
| `GET /clients/:id`                   |                                 | `200` or `404`          |
| `PATCH /clients/:id`                 | any of `name`, `email`, `phone` | `200` or `404`          |
| `DELETE /clients/:id`                |                                 | `204` or `404`          |
| `GET /clients/:clientId/properties`  |                                 | `200` list or `404`     |
| `POST /clients/:clientId/properties` | property fields, see below      | `201` property or `404` |
| `GET /properties/:id`                |                                 | `200` or `404`          |
| `PATCH /properties/:id`              | any of the property fields      | `200` or `404`          |
| `DELETE /properties/:id`             |                                 | `204` or `404`          |

In a `PATCH`, fields left out are unchanged and `null` clears a field.
Invalid input answers `400 validation_error`; a malformed body answers
`400 invalid_json`.

```sh
curl -X POST localhost:3000/clients \
  -H 'content-type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com"}'
# {"id":"...","name":"Jane Doe","email":"jane@example.com","phone":null,"createdAt":"...","updatedAt":"..."}
```

A property is an address where jobs happen, and it belongs to one client. The
collection is nested under the client (`404` when the client does not exist), a
single property is addressed by its own id, and deleting a client deletes its
properties. Property fields: `addressLine1`, `city`, `province` and
`postalCode` are required; `addressLine2`, `notes` and `country` (two-letter
code, default `CA`) are optional.

```sh
curl -X POST localhost:3000/clients/$CLIENT_ID/properties \
  -H 'content-type: application/json' \
  -d '{"addressLine1":"123 Example St","city":"Toronto","province":"ON","postalCode":"M5V 0A1"}'
# {"id":"...","clientId":"...","addressLine1":"123 Example St","addressLine2":null,"city":"Toronto","province":"ON","postalCode":"M5V 0A1","country":"CA","notes":null,"createdAt":"...","updatedAt":"..."}
```

## Database

Migrations are plain SQL files in `migrations/`, named `NNNN_description.sql`
and applied in name order by `npm run db:migrate`. Applied names are recorded
in the `schema_migrations` table, so running the command again is a no-op.
Each file runs inside a transaction: if it fails, nothing from it is kept.

To add a migration, create the next numbered file and run `npm run db:migrate`.
There are no down migrations; to start over locally,
`dropdb cleanm_dev && createdb cleanm_dev`.

## Scripts

| Script               | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Starts the server and restarts it when a file changes     |
| `npm start`          | Starts the server once                                    |
| `npm run typecheck`  | Type-checks with `tsc`, no output files                   |
| `npm run lint`       | Runs ESLint and checks formatting with Prettier           |
| `npm run lint:fix`   | Fixes what ESLint can fix and formats files with Prettier |
| `npm run db:migrate` | Applies pending SQL migrations to `DATABASE_URL`          |
| `npm run db:seed`    | Creates the development organization and prints its id    |

TypeScript runs directly on Node (native type stripping), so there is no build step.

Project context, scope and roadmap: [docs/project-brief.md](docs/project-brief.md).

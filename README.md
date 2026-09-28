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

Configure the environment, apply the migrations and start the server:

```sh
cp .env.example .env
npm run db:migrate
npm run dev
```

Then:

```sh
curl localhost:3000/health
# {"status":"ok"}
```

Configuration comes from environment variables, loaded from `.env` when the
file exists (see `.env.example`): `PORT` (default `3000`) and `DATABASE_URL`.

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

TypeScript runs directly on Node (native type stripping), so there is no build step.

Project context, scope and roadmap: [docs/project-brief.md](docs/project-brief.md).

# cleanm-api

REST API for CleanM: scheduling, client management and invoicing for residential cleaning businesses

## Getting started

Requires Node 24. The version is pinned in `.nvmrc`, so with nvm:

```sh
nvm install
npm ci
npm run dev
```

Then:

```sh
curl localhost:3000/health
# {"status":"ok"}
```

The port defaults to `3000` and can be changed with the `PORT` environment variable.

## Scripts

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Starts the server and restarts it when a file changes     |
| `npm start`         | Starts the server once                                    |
| `npm run typecheck` | Type-checks with `tsc`, no output files                   |
| `npm run lint`      | Runs ESLint and checks formatting with Prettier           |
| `npm run lint:fix`  | Fixes what ESLint can fix and formats files with Prettier |

TypeScript runs directly on Node (native type stripping), so there is no build step.

Project context, scope and roadmap: [docs/project-brief.md](docs/project-brief.md).

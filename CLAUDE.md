# cleanm-api

REST API for CleanM (clean management): scheduling, client management and
invoicing for residential cleaning businesses.
Sibling repos: cleanm-web (React, later), cleanm-ios (native Swift, later).

Full context, scope, roadmap and decisions: @docs/project-brief.md

## Stack decided so far

Node 24 (.nvmrc, nvm), TypeScript 6, Express 5, ESLint + Prettier

Database, ORM, validation, tests and auth are not decided yet. Do not introduce
them unless asked, and explain the alternatives first.

## Commands

npm run dev | npm run typecheck | npm run lint

## Git: the human owns it

Never run `git add`, `git commit`, `git push`, `git merge`, `git rebase` or `gh`.
Never open pull requests.

Read-only git is fine: `status`, `diff`, `log`.

When a unit of work is ready, stop and propose the files to stage and a
Conventional Commit message. I run the commands myself.

Workflow: short-lived branch (`feat/`, `fix/`, `chore/`) -> pull request opened
on the GitHub web UI -> "Rebase and merge" -> `main`.

## Conventions

- Everything written to the repo is in English: code, comments, docs, commits.
- Small commits, one per concept.
- This is a public repository. No secrets and no real client data: `.env` is
  ignored, `.env.example` has fake values, seeds and tests use invented data.

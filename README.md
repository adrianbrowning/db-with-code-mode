# Netlify DB + TanStack AI Code Mode demo

A TanStack Start app running on Netlify, using **Netlify Database** (Postgres) for the data layer and **TanStack AI Code Mode** for the LLM tool layer. See [`CODE-MODE.md`](./CODE-MODE.md) for the architecture deep-dive.

# Getting Started

## Prerequisites

### Node.js 24

`isolated-vm` (the native V8 sandbox used by Code Mode) requires **Node.js 24** — it ships prebuilt binaries for Node 24's ABI but not Node 25, and the project is in maintenance mode. The repo includes an `.nvmrc` pinned to `24`:

```bash
nvm install 24
nvm use          # reads .nvmrc
```

### Netlify CLI

The Vite dev server starts the local Postgres database in-process (see "First-time setup" below), but the `db:*` scripts (apply migrations, reset, studio) shell out to the Netlify CLI, so install it once:

```bash
npm install -g netlify-cli
```

### `.env.local` — at least one AI provider key

```env
ANTHROPIC_API_KEY=...
# Optional, any of these also work as the model selector picks them up:
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

## First-time setup

Four steps. The DB needs to be migrated *and* seeded before you open the app — otherwise the first page load hits `Error: relation "purchases" does not exist` or returns an empty result set.

### 1. Install dependencies

```bash
pnpm install     # also compiles the isolated-vm native addon
```

### 2. Boot the local DB

```bash
# terminal 1 — boots Vite + the local Postgres
pnpm dev
```

The Vite plugin starts the local Postgres-compatible database in-process and writes its connection string to `.netlify/state.json#dbConnectionString`. Both `pnpm db:apply` and `pnpm db:seed` (and `drizzle-kit`) read from there, so this terminal stays up.

### 3. Apply the schema migration, then seed demo data

```bash
# terminal 2
pnpm db:apply    # runs netlify/database/migrations/<timestamp>_initial_schema/migration.sql
pnpm db:seed     # runs db/seed.ts → 35 customers, 20 products, 550 purchases
```

`db:apply` only contains the schema (DDL). The demo dataset lives in `db/seed-data.ts` and is loaded by `db/seed.ts`, which `TRUNCATE … RESTART IDENTITY`s the three tables before re-inserting, so it's safe to re-run any time.

The DB persists on disk under `.netlify/db/`, so step 3 is only needed again after `pnpm db:reset` (or you change the seed and want it back in).

> **Tip — peek at the data before the app.** Run `pnpm db:studio` in terminal 2 to open [https://local.drizzle.studio](https://local.drizzle.studio) connected to the local DB. Useful when demoing — show the tables, then open the app. Ctrl+C Studio when you're done. (If it errors with `EADDRINUSE: 127.0.0.1:4983`, an old Studio is still running — `lsof -ti:4983 | xargs kill` and retry.)

### 4. Open the app

[http://localhost:3000/](http://localhost:3000/)

> **Why `pnpm dev` doesn't need `netlify dev` here.** The `dev` script sets `EXPERIMENTAL_NETLIFY_DB_ENABLED=1` before invoking Vite. That flag is read by `@netlify/dev` (which the Vite plugin wraps) and turns on the database feature. Without it, the Vite plugin emulates everything *else* (aiGateway, blobs, functions, etc.) but skips the DB, and `getDatabase()` would throw `MissingDatabaseConnectionError`. You can still run `netlify dev` if you want the full proxy at `localhost:8888`, but it isn't required for the database to work.

## Day-to-day

```bash
pnpm dev
```

The seed data persists across restarts; you only need step 3 above again after `pnpm db:reset` or a fresh clone.

## Database scripts

| Script | What it runs | When you need it |
|--------|--------------|------------------|
| `pnpm db:status`   | `netlify database status` | See applied vs pending migrations and the local DB connection string |
| `pnpm db:apply`    | `netlify database migrations apply` | Apply pending schema migrations to the running local DB |
| `pnpm db:seed`     | `tsx db/seed.ts` | Re-seed the demo data (truncates `customers`, `products`, `purchases` first, then re-inserts from `db/seed-data.ts`) |
| `pnpm db:reset`    | `netlify database reset` | Drop everything in the local DB and start over (then `db:apply` + `db:seed` again) |
| `pnpm db:generate` | `drizzle-kit generate` | Regenerate a schema migration from `db/schema.ts` after edits |
| `pnpm db:studio`   | `drizzle-kit studio` | Open Drizzle Studio against the local DB (uses the connection string in `.netlify/state.json`) |

Inspect the DB directly while `pnpm dev` (or `netlify dev`) is running:

```bash
netlify database connect                                      # interactive REPL
netlify database connect --query "SELECT count(*) FROM purchases"
netlify database connect --json                               # connection details for psql / TablePlus / etc.
```

### Day-to-day reset cycle

```bash
pnpm db:reset && pnpm db:apply && pnpm db:seed
```

### Editing the schema

`pnpm db:generate` (drizzle-kit beta.21+) emits a directory of the form `netlify/database/migrations/<YYYYMMDDHHMMSS>_<description>/migration.sql` plus a sibling `snapshot.json` — exactly the shape Netlify's migration runner wants, so no manual move is needed. After regenerating, run `pnpm db:apply` to apply the new migration, and `pnpm db:seed` again if any of the seeded columns changed.

### Rebuilding from absolute zero (sanity check)

To validate that `db/schema.ts` is the true source of truth — i.e. you can throw away everything else and the pipeline rebuilds itself — wipe both the committed migration and the persisted DB, then walk through the full loop:

```bash
rm -rf netlify/database/migrations    # toss the committed schema migration
rm -rf .netlify                       # toss the persisted Postgres data + state.json

pnpm dev                              # terminal 1
pnpm db:generate                      # terminal 2 — drizzle-kit reads db/schema.ts and writes a fresh <timestamp>_<name>/migration.sql
pnpm db:apply                         # apply that migration
pnpm db:seed                          # load demo data
pnpm db:studio                        # optional — eyeball the data before opening the app
# http://localhost:3000
```

The regenerated migration is byte-identical SQL to the one this repo ships with — only the timestamp and the snapshot UUID differ. After confirming the app works end-to-end, either commit the new migration or `git checkout` to restore the original. Don't leave the repo in a "no migrations committed" state — production deploys need that file.

## Building For Production

```bash
pnpm build
```

Deploying via the Netlify UI / `netlify deploy` will provision the production database and apply pending migrations as part of the deploy lifecycle.

## Testing

```bash
pnpm test            # vitest run
```

## Learn more

- Architecture deep-dive for this demo: [`CODE-MODE.md`](./CODE-MODE.md)
- Netlify Database: [docs](https://docs.netlify.com/build/data-and-storage/netlify-database/) · [local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)
- TanStack AI Code Mode: [`@tanstack/ai-code-mode`](https://www.npmjs.com/package/@tanstack/ai-code-mode)
- TanStack Start: [docs](https://tanstack.com/start)

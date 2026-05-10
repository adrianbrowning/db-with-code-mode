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

Three steps. The DB needs to be migrated before you open the app — otherwise the first page load hits `Error: relation "purchases" does not exist`.

### 1. Install dependencies

```bash
pnpm install     # also compiles the isolated-vm native addon
```

### 2. Apply the schema and seed data

The Vite plugin starts the local Postgres-compatible database in-process when you run `pnpm dev`, so the dev server has to be up first. Migrations don't auto-apply locally — you trigger them yourself:

```bash
# terminal 1 — boots Vite + the local Postgres
pnpm dev

# terminal 2 — applies the schema and seed
pnpm db:apply
```

That applies, in order:

1. `netlify/database/migrations/20250415162953_initial_schema/migration.sql` — `customers`, `products`, `purchases`, `posts`
2. `netlify/database/migrations/20250415162954_seed_data/migration.sql` — 35 customers, 20 products, 550 purchases (identity sequences re-synced via `setval`)

The DB persists on disk under `.netlify/db/`, so step 2's `pnpm db:apply` is only needed once per fresh clone or after `pnpm db:reset`.

### 3. Open the app

[http://localhost:3000/](http://localhost:3000/)

> **Why `pnpm dev` doesn't need `netlify dev` here.** The `dev` script sets `EXPERIMENTAL_NETLIFY_DB_ENABLED=1` before invoking Vite. That flag is read by `@netlify/dev` (which the Vite plugin wraps) and turns on the database feature. Without it, the Vite plugin emulates everything *else* (aiGateway, blobs, functions, etc.) but skips the DB, and `getDatabase()` would throw `MissingDatabaseConnectionError`. You can still run `netlify dev` if you want the full proxy at `localhost:8888`, but it isn't required for the database to work.

## Day-to-day

```bash
pnpm dev
```

The seed data persists across restarts; you only need step 2 above again after `pnpm db:reset` or a fresh clone.

## Database scripts

| Script | What it runs | When you need it |
|--------|--------------|------------------|
| `pnpm db:status`   | `netlify database status` | See applied vs pending migrations and the local DB connection string |
| `pnpm db:apply`    | `netlify database migrations apply` | Apply pending migrations to the running local DB |
| `pnpm db:reset`    | `netlify database reset` | Drop everything in the local DB and start over (then `db:apply` again) |
| `pnpm db:generate` | `drizzle-kit generate` | Regenerate a schema migration from `db/schema.ts` after edits (see note below) |
| `pnpm db:studio`   | `netlify dev:exec drizzle-kit studio` | Open Drizzle Studio against the local DB |

Inspect the DB directly while `pnpm dev` (or `netlify dev`) is running:

```bash
netlify database connect                                      # interactive REPL
netlify database connect --query "SELECT count(*) FROM purchases"
netlify database connect --json                               # connection details for psql / TablePlus / etc.
```

> **Future migrations — naming caveat.** `drizzle-kit generate` emits flat files like `0000_xxx.sql` into `netlify/database/migrations/`. Netlify's migration runner instead expects directories named `<YYYYMMDDHHMMSS>_<description>/migration.sql`. After running `pnpm db:generate`, move the generated `.sql` file into a timestamped directory before committing — or use `netlify database migrations new --description "..."` to create the wrapper directory and paste the SQL into its `migration.sql`.

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

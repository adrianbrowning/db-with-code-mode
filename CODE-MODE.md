# Code Mode Database Demo

A TanStack AI Code Mode demo running on Netlify with an in-memory database of customers, products, and purchases. Based on the [ts-code-mode-web database demo](https://github.com/TanStack/ai/tree/main/examples/ts-code-mode-web/src/routes/_database-demo).

## Prerequisites

### Node.js 24

`isolated-vm` (the native V8 sandbox used by Code Mode) requires **Node.js 24**. It ships prebuilt binaries for ABI 137 (Node 24) but does not support ABI 141 (Node 25), and the project is in maintenance mode with no plans to add support. On Node 25 the native module segfaults at runtime and falls back to the slower QuickJS driver.

The repo includes an `.nvmrc` pinned to `24`. If you use nvm:

```bash
nvm install 24
nvm use          # reads .nvmrc
```

### Environment

Requires at least one AI provider key in `.env.local`:

```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

## Running

```bash
pnpm install     # compiles isolated-vm native addon
pnpm dev         # starts Vite + a local Netlify Postgres via the Netlify Vite plugin
```

Then open http://localhost:3000/

### First-run database setup

The Vite plugin boots a real local Postgres-compatible database in-process (the
same engine `netlify dev` uses) and exposes it via `NETLIFY_DB_URL`. The `dev`
script sets `EXPERIMENTAL_NETLIFY_DB_ENABLED=1` to turn on that feature in
`@netlify/dev`. Migrations don't apply automatically in local dev — you control
when they run. With `pnpm dev` running in another terminal, apply the schema +
seed data once:

```bash
pnpm db:apply         # = netlify database migrations apply
```

That runs both migrations in order:

1. `netlify/database/migrations/20250415162953_initial_schema/migration.sql` — `customers`, `products`, `purchases`, `posts`
2. `netlify/database/migrations/20250415162954_seed_data/migration.sql` — 35 customers, 20 products, 550 purchases (sequences re-synced via `setval`)

Other useful scripts:

| Script | What it runs | When you need it |
|--------|--------------|------------------|
| `pnpm db:status`   | `netlify database status` | See applied vs pending migrations and the local DB state |
| `pnpm db:apply`    | `netlify database migrations apply` | Apply pending migrations to the running local DB |
| `pnpm db:reset`    | `netlify database reset` | Drop everything in the local DB and start over (then `db:apply` again) |
| `pnpm db:generate` | `drizzle-kit generate` | Regenerate a schema migration from `db/schema.ts` after edits (see note below) |
| `pnpm db:studio`   | `netlify dev:exec drizzle-kit studio` | Open Drizzle Studio against the local DB |

Inspect the DB directly:

```bash
netlify database connect                                      # interactive REPL
netlify database connect --query "SELECT count(*) FROM purchases"
```

> Note on `db:generate`: drizzle-kit emits files like `0000_xxx.sql` into
> `netlify/database/migrations/`. Netlify's migration runner instead expects
> `<YYYYMMDDHHMMSS>_<description>/migration.sql` directories. After running
> `pnpm db:generate`, move the generated `.sql` file into a timestamped
> directory before committing (or use `netlify database migrations new
> --description "..."` to create the wrapper directory and paste the SQL into
> its `migration.sql`).

## Architecture

### How Code Mode Works

Instead of the LLM making many individual tool calls (queryTable, queryTable, queryTable...), Code Mode has the LLM write a single TypeScript program that calls tools as functions (`external_queryTable(...)`, `external_getSchemaInfo(...)`). This program runs in a sandboxed VM (Node `isolated-vm` with QuickJS fallback). The result: fewer LLM round-trips, less token usage, and faster responses.

### Netlify Database

The demo uses Netlify Database (Postgres) via the `@netlify/database` native driver for the tool layer. The data is seeded via a SQL migration (`netlify/database/migrations/20250415162954_seed_data/migration.sql`):

- **customers** (35 rows) — id, name, email, city, joined
- **products** (20 rows) — id, name, category, price, stock
- **purchases** (550 rows) — id, customer_id, product_id, quantity, total, purchased_at

### Drizzle Schema

`db/schema.ts` defines matching `customers`, `products`, and `purchases` tables in Drizzle for Netlify DB. The schema migrations are in `netlify/database/migrations/`.

## File Map

### API Routes

| File | Route | Purpose |
|------|-------|---------|
| `src/routes/demo/api.database-demo.ts` | `POST /demo/api/database-demo` | Main chat endpoint. Handles code mode vs direct tools, skills, metrics instrumentation. |
| `src/routes/demo/api.db-skills.ts` | `GET/DELETE /demo/api/db-skills` | Skills CRUD — list all skills, delete by name, delete all. |

### Page

| File | Route | Purpose |
|------|-------|---------|
| `src/routes/demo/database-demo.tsx` | `/demo/database-demo` | Full demo UI — chat, schema sidebar, settings, metrics sidebar, skills dialog. |

### Library Code

| File | Purpose |
|------|---------|
| `src/lib/tools/database-tools.ts` | Netlify Database queries + `queryTable` and `getSchemaInfo` tool definitions. |
| `src/lib/create-isolate-driver.ts` | Factory for the sandboxed JS VM driver (Node isolate with QuickJS fallback). |
| `src/lib/efficiency.ts` | `formatDuration` helper for the metrics sidebar. |

### UI Components (`src/components/db-demo/`)

| File | Purpose |
|------|---------|
| `CodeBlock.tsx` | Syntax-highlighted TypeScript with copy button, collapse/expand, status badge. Auto-collapses after execution. |
| `ExecutionResult.tsx` | Shows execution outcome — success/error status, console logs, return value. |
| `JavaScriptVM.tsx` | Real-time event stream from the sandbox: external function calls, results, console output. |
| `ChatInput.tsx` | Textarea with auto-resize, Enter-to-send, example query hints. |
| `index.ts` | Barrel exports + `VMEvent` type. |

### Database Schema

| File | Purpose |
|------|---------|
| `db/schema.ts` | Drizzle schema for `posts` (pre-existing), `customers`, `products`, `purchases`. |
| `db/index.ts` | Drizzle client using `drizzle-orm/netlify-db`. |
| `drizzle.config.ts` | Points at `NETLIFY_DATABASE_URL`, outputs to `./migrations`. |

## Dependencies Added

**Runtime:**
- `@tanstack/ai-code-mode` — Code mode tool creation (LLM writes code instead of making tool calls)
- `@tanstack/ai-code-mode-skills` — Skill registration/management (reusable code snippets)
- `@tanstack/ai-isolate-node` — Node.js `isolated-vm` sandbox driver
- `@tanstack/ai-isolate-quickjs` — QuickJS fallback sandbox driver
- `react-markdown` — Markdown rendering in chat messages
- `remark-gfm` — GitHub Flavored Markdown (tables, strikethrough, etc.)
- `rehype-raw` — Allow raw HTML in markdown
- `rehype-sanitize` — Sanitize HTML output
- `rehype-highlight` — Syntax highlighting in markdown code blocks
- `@netlify/neon` — Netlify DB driver (was referenced by `db/index.ts` but missing)

**Build config:**
- `isolated-vm` added to `pnpm.onlyBuiltDependencies` in `package.json` (native module needs compilation)
- `.nvmrc` pins Node.js 24 (required for `isolated-vm` — see [Prerequisites](#nodejs-24))

## UI Features

- **Model selector** — Claude Haiku 4.5, Claude Haiku 4, GPT-4o, Gemini 2.5 Flash
- **Code Mode toggle** — Switch between code mode (LLM writes TypeScript) and direct tool calling
- **Skills toggle** — When enabled, the AI registers reusable skills after each successful execution
- **Schema sidebar** — Shows table structure at a glance
- **Metrics sidebar** — Per-query stats: LLM calls, tool calls, wall-clock time
- **6 example queries** — Pre-built prompts for cross-table analytics
- **Export** — Download chat as JSON

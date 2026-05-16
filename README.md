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

### `.env.local` — AWS Bedrock configuration

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# Optional — only needed for temporary/session credentials:
# AWS_SESSION_TOKEN=...
# Optional — override the default model:
# BEDROCK_MODEL=us.anthropic.claude-3-5-sonnet-20241022-v2:0
```

See [BEDROCK_SETUP.md](./docs/BEDROCK_SETUP.md) for IAM setup and local dev credentials.

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
| `pnpm db:seed:migration` | `tsx db/generate-seed-migration.ts` | Emit `db/seed-data.ts` as an idempotent SQL data migration under `netlify/database/migrations/<timestamp>_seed_demo_data/` — used to seed production via the auto-apply pipeline when you don't have a writable connection string (see [Path C](#path-c--no-team-owner-no-github-repo-seed-via-data-migration) below) |
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

This produces the static client bundle in `dist/client` and the server bundle Netlify Functions will run. You generally won't run `pnpm build` by hand for a Netlify deploy — `netlify deploy --build` (and the GitHub-integrated build) call it for you.

## Deploying to Netlify

The production database is provisioned the first time you deploy, and any migrations under `netlify/database/migrations/` that exist **in the working tree at deploy time** get applied automatically by the Netlify Database build extension. Two things the deploy lifecycle does *not* do for you, both manual one-time steps:

- ensure a migration file actually exists under `netlify/database/migrations/` before you deploy (drizzle-kit-generated migrations are gitignored in some setups, and `netlify deploy --build` will happily ship an empty schema otherwise — see step 2),
- seed the demo data (step 4).

### 1. Link (or create) a Netlify site

From the repo root:

```bash
netlify login           # one-time, opens a browser
netlify init            # create a new Netlify site for this repo, OR
netlify link            # link this repo to an existing Netlify site
```

`netlify init` will read `netlify.toml` (`command = "vite build"`, `publish = "dist/client"`, `NODE_VERSION = "24"`) and offer to wire up the GitHub integration so subsequent pushes deploy automatically.

### 2. Make sure a migration is committed

Check that `netlify/database/migrations/` is non-empty in the tree you're about to deploy:

```bash
ls netlify/database/migrations
# expect: <YYYYMMDDHHMMSS>_<name>/   (with migration.sql + snapshot.json inside)
```

If it's empty (e.g. you deleted it during the [absolute-zero rebuild](#rebuilding-from-absolute-zero-sanity-check)), regenerate it before deploying:

```bash
pnpm dev          # terminal 1 — Vite needs to be up so drizzle-kit can read the connection string
pnpm db:generate  # terminal 2 — writes netlify/database/migrations/<timestamp>_<name>/
```

Commit the result. The Netlify Database build extension reads this directory during the build phase — if the files aren't on disk during `netlify deploy --build` (or the GitHub-triggered build), the extension prints `Provisioning database` but applies zero migrations, leaves the production schema empty, and `netlify database status --branch production` will report `Applied migrations (0)`.

### 3. Deploy

```bash
netlify deploy --build --prod
```

(or just `git push` if you wired up the GitHub integration during `netlify init`.) The first production deploy will:

1. Provision the production Postgres branch.
2. Run `vite build`.
3. Apply every migration in `netlify/database/migrations/` against the production DB (look for the `Netlify Database setup` step in the build log).
4. Publish the site.

> **For production:** Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` in the Netlify UI → Site Settings → Environment variables. Alternatively, configure an IAM role for the Netlify execution environment — see [BEDROCK_SETUP.md](./docs/BEDROCK_SETUP.md#production-deployment-netlify) for both options. Netlify auto-injects `NETLIFY_DATABASE_URL` / `NETLIFY_DB_URL` for the database with no extra configuration.

### 4. Seed the production database

The deploy applies the schema but does **not** run `db/seed.ts`, so a fresh production DB has zero customers / products / purchases and the app will load with empty charts. Three paths are available; which one is right for you depends on your team role and whether the site is connected to a GitHub repo:

| Your situation | Recommended path |
|----------------|------------------|
| Team Owner of the Netlify team that owns the site | **[Path A](#path-a--team-owner-seed-via-pnpm-dbseed)** — point local `pnpm db:seed` at the production connection string |
| Developer (non-Owner), site connected to a GitHub repo | **[Path B](#path-b--developer-with-github-repo-seed-a-deploy-preview-branch)** — seed a deploy-preview branch (Developers get writable creds on non-prod branches) |
| Developer (non-Owner), site NOT connected to GitHub *(typical demo: `netlify init` → "create and deploy project manually")* | **[Path C](#path-c--no-team-owner-no-github-repo-seed-via-data-migration)** — ship the seed as a data migration through the auto-apply pipeline |

> **Why three paths?** Per [Netlify's database access control](https://docs.netlify.com/build/data-and-storage/netlify-database/access-control/), only the **Team Owner** can copy a writable connection string for the `production` branch. Everyone else (Developer / Developer Lite) gets the read-only `netlifydb_readonly` role — confirm by running `netlify database status --branch production --show-credentials` and checking the username in the URL. `pnpm db:seed` starts with `TRUNCATE TABLE purchases, products, customers RESTART IDENTITY CASCADE`, which the read-only role will reject with `permission denied for table purchases`. Path B works around that by seeding a deploy-preview database branch (writable for Developers) — but [deploy previews are PR-triggered](https://docs.netlify.com/build/data-and-storage/netlify-database/), so they only exist when the site is connected to a GitHub repo. Path C sidesteps both restrictions by running the seed through the migration pipeline, which uses Netlify's internal credentials regardless of your role.

#### Path A — Team Owner: seed via `pnpm db:seed`

Grab the writable connection string (Team Owners get the full credentials from `--show-credentials`) and point the existing `pnpm db:seed` script at it. `db/seed.ts` already prefers `NETLIFY_DB_URL` over `.netlify/state.json`, so you don't need `pnpm dev` running:

```bash
netlify database status --branch production --show-credentials
# copy the URL — username should NOT be netlifydb_readonly

NETLIFY_DB_URL="postgres://…the URL from above…" pnpm db:seed
```

`--json` exposes the same data for scripting — the connection string is nested under `.database.connectionString`:

```bash
NETLIFY_DB_URL="$(netlify database status --branch production --show-credentials --json | jq -r '.database.connectionString')" pnpm db:seed
```

#### Path B — Developer with GitHub repo: seed a deploy-preview branch

Push a branch (or open a PR) to trigger a deploy preview — that allocates a new database branch, copy of production, with a writable connection string the Developer role *can* see. Then:

```bash
netlify database status --branch <your-preview-branch> --show-credentials
NETLIFY_DB_URL="postgres://…preview-branch URL…" pnpm db:seed
```

To promote that data into the production branch, either merge a PR that ships the data via Path C below (a Team Owner doesn't have to be involved beyond the normal merge-to-main flow), or have a Team Owner run Path A.

#### Path C — No Team Owner, no GitHub repo: seed via data migration

This is the easiest path for a demo site you set up with `netlify init` → "create and deploy project manually" (no git remote, so no PRs, so no deploy previews — Path B doesn't apply). Instead, emit `db/seed-data.ts` as a SQL migration and let the same auto-apply pipeline that ran your schema migration also load the seed data. The pipeline uses Netlify's internal credentials, so your role doesn't matter.

```bash
# 1. Generate the migration. Writes
#    netlify/database/migrations/<timestamp>_seed_demo_data/migration.sql
pnpm db:seed:migration

# 2. (recommended) eyeball the file — it's pure INSERTs with
#    ON CONFLICT ("id") DO NOTHING + setval, all readable
ls netlify/database/migrations/*_seed_demo_data
cat netlify/database/migrations/*_seed_demo_data/migration.sql | head

# 3. Commit and redeploy. The Netlify Database build extension
#    applies the new migration just before the deploy is published.
git add netlify/database/migrations/*_seed_demo_data
git commit -m "Seed demo data via migration"
netlify deploy --build --prod                # or: git push, if you set up CI later

# 4. Confirm — should now show 35 / 20 / 550
netlify database status --branch production --json \
  | jq '.applied[].name'                     # the seed migration should be listed
```

The generated SQL is **idempotent**: every `INSERT` has `ON CONFLICT ("id") DO NOTHING`, and the trailing `setval(pg_get_serial_sequence(…), MAX(id))` advances the identity sequences past the seeded ids so the app's own `INSERT`s allocate fresh ids without colliding. So if you ever need to re-deploy with the same seed migration applied, it's a no-op against the existing rows — but note the migration system tracks applied migrations, so it normally won't re-run anyway.

If you change `db/seed-data.ts` later and want a *new* seed (e.g. you added a customer):

```bash
rm -rf netlify/database/migrations/*_seed_demo_data   # delete the old one
pnpm db:seed:migration                                # emit a fresh one
git add … && git commit … && netlify deploy --build --prod
```

`db/generate-seed-migration.ts` refuses to run if a `*_seed_demo_data` migration already exists — that's deliberate, to keep you from accumulating duplicate seed migrations that all try to insert id `1`.

### Day-2: re-deploy + re-seed

```bash
git push                 # auto-deploy + auto-apply any new migrations
                         # (or: netlify deploy --build --prod)
```

You only need to re-seed when the shape of `db/seed-data.ts` changes — re-run whichever path you used in step 4. For Paths A and B that means re-running `pnpm db:seed`. For Path C, follow the "If you change `db/seed-data.ts` later" recipe above.

> **⚠️ Never run `pnpm db:seed` against a production DB that holds real user data** — its first statement is `TRUNCATE TABLE purchases, products, customers RESTART IDENTITY CASCADE` and it will wipe the lot. Path C is non-destructive (`ON CONFLICT DO NOTHING`) but is also conceptually a one-shot demo seed, not a general data-import tool.

## Testing

```bash
pnpm test            # vitest run
```

## Learn more

- Architecture deep-dive for this demo: [`CODE-MODE.md`](./CODE-MODE.md)
- Netlify Database: [docs](https://docs.netlify.com/build/data-and-storage/netlify-database/) · [local development](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)
- TanStack AI Code Mode: [`@tanstack/ai-code-mode`](https://www.npmjs.com/package/@tanstack/ai-code-mode)
- TanStack Start: [docs](https://tanstack.com/start)

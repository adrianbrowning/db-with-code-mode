import { readFileSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit (studio / introspect) needs an explicit `dbCredentials.url`.
// Discovery order:
//   1. `NETLIFY_DB_URL` from the environment (CI, deploy previews, overrides).
//   2. `.netlify/state.json#dbConnectionString` — written by the Netlify Vite
//      plugin when `pnpm dev` is running, the same source `pnpm db:apply` and
//      `netlify database connect` already read from.
function getConnectionString(): string {
  if (process.env.NETLIFY_DB_URL) return process.env.NETLIFY_DB_URL;

  try {
    const state = JSON.parse(readFileSync(".netlify/state.json", "utf-8"));
    if (typeof state.dbConnectionString === "string") {
      return state.dbConnectionString;
    }
  } catch {
    // fall through to the error below
  }

  throw new Error(
    "No NETLIFY_DB_URL and .netlify/state.json has no dbConnectionString.\n" +
      "Start the dev server first: `pnpm dev` (in another terminal).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "netlify/database/migrations",
  dbCredentials: { url: getConnectionString() },
});

import { readFileSync } from 'node:fs'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { customers, products, purchases } from './schema'
import { CUSTOMERS, PRODUCTS, PURCHASES } from './seed-data'

// Connection-string discovery mirrors drizzle.config.ts. We don't reuse
// db/index.ts (drizzle-orm/netlify-db) because that driver demands
// NETLIFY_DB_URL be present at module init, which `pnpm dev` doesn't
// export to sibling shells.
function getConnectionString(): string {
  const fromEnv = process.env.NETLIFY_DB_URL ?? process.env.NETLIFY_DATABASE_URL
  if (fromEnv) return fromEnv

  try {
    const state = JSON.parse(readFileSync('.netlify/state.json', 'utf8'))
    if (typeof state.dbConnectionString === 'string') {
      return state.dbConnectionString
    }
  } catch {
    // fall through
  }

  throw new Error(
    'No connection string available.\n' +
      'Start `pnpm dev` first so the Netlify Vite plugin writes ' +
      '.netlify/state.json#dbConnectionString, then re-run `pnpm db:seed`.',
  )
}

// Why TRUNCATE … RESTART IDENTITY: the schema uses GENERATED ALWAYS AS
// IDENTITY, so we cannot supply explicit ids. Resetting the sequences first
// guarantees that inserting CUSTOMERS / PRODUCTS in array order assigns ids
// 1..N, which is exactly what PURCHASES.customer_id / product_id already
// reference (the seed-data is laid out so array index + 1 = id).
async function main() {
  const pool = new Pool({ connectionString: getConnectionString() })
  const db = drizzle({
    client: pool,
    schema: { customers, products, purchases },
  })

  try {
    console.log('Truncating customers, products, purchases…')
    await db.execute(
      sql`TRUNCATE TABLE purchases, products, customers RESTART IDENTITY CASCADE`,
    )

    console.log(`Inserting ${CUSTOMERS.length} customers…`)
    await db.insert(customers).values(CUSTOMERS.map((c) => ({ ...c })))

    console.log(`Inserting ${PRODUCTS.length} products…`)
    await db.insert(products).values(PRODUCTS.map((p) => ({ ...p })))

    console.log(`Inserting ${PURCHASES.length} purchases…`)
    const CHUNK = 100
    for (let i = 0; i < PURCHASES.length; i += CHUNK) {
      await db
        .insert(purchases)
        .values(PURCHASES.slice(i, i + CHUNK).map((p) => ({ ...p })))
    }

    console.log(
      `✓ Seeded ${CUSTOMERS.length} customers, ${PRODUCTS.length} products, ${PURCHASES.length} purchases`,
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

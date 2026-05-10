import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { getDatabase } from '@netlify/database'
import {
  type Table,
  TABLE_SCHEMAS,
  VALID_COLUMNS,
  convertRow,
} from './database-constants'

export const queryTableTool = toolDefinition({
  name: 'queryTable',
  description:
    'Query a database table backed by Netlify Database (Postgres). Supports filtering rows by exact-match conditions on columns, selecting specific columns, ordering by a column, and limiting results. Available tables: customers (id, name, email, city, joined), products (id, name, category, price, stock), purchases (id, customer_id, product_id, quantity, total, purchased_at).',
  inputSchema: z.object({
    table: z
      .enum(['customers', 'products', 'purchases'])
      .describe('The table to query'),
    columns: z
      .array(z.string())
      .optional()
      .describe('Columns to return. If omitted, all columns are returned.'),
    where: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe(
        'Filter conditions as key-value pairs (exact match). Example: { "city": "New York" }',
      ),
    orderBy: z.string().optional().describe('Column name to sort results by'),
    orderDirection: z
      .enum(['asc', 'desc'])
      .optional()
      .describe('Sort direction, defaults to asc'),
    limit: z.number().optional().describe('Maximum number of rows to return'),
  }),
  outputSchema: z.object({
    rows: z.array(z.record(z.string(), z.any())),
    totalMatchingRows: z.number(),
  }),
}).server(async ({ table, columns, where, orderBy, orderDirection, limit }) => {
  const db = getDatabase()
  const validCols = VALID_COLUMNS[table]

  // Determine SELECT columns
  const selectCols = columns && columns.length > 0
    ? columns.filter((c) => validCols.has(c))
    : [...validCols]

  if (selectCols.length === 0) {
    throw new Error('No valid columns specified')
  }

  const selectClause = selectCols.map((c) => `"${c}"`).join(', ')
  let query = `SELECT ${selectClause} FROM "${table}"`
  const params: unknown[] = []

  // WHERE clause
  if (where && Object.keys(where).length > 0) {
    const conditions: string[] = []
    for (const [key, value] of Object.entries(where)) {
      if (!validCols.has(key)) continue
      params.push(value)
      conditions.push(`"${key}" = $${params.length}`)
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`
    }
  }

  // Count matching rows
  const countQuery = `SELECT COUNT(*) as count FROM "${table}"${query.includes(' WHERE ') ? query.slice(query.indexOf(' WHERE')) : ''}`
  const countResult = await db.pool.query(countQuery, params)
  const totalMatchingRows = parseInt(countResult.rows[0].count, 10)

  // ORDER BY
  if (orderBy && validCols.has(orderBy)) {
    const dir = orderDirection === 'desc' ? 'DESC' : 'ASC'
    query += ` ORDER BY "${orderBy}" ${dir}`
  }

  // LIMIT
  if (limit !== undefined) {
    params.push(limit)
    query += ` LIMIT $${params.length}`
  }

  const result = await db.pool.query(query, params)
  const rows = result.rows.map(convertRow)

  return { rows, totalMatchingRows }
})

export const getSchemaInfoTool = toolDefinition({
  name: 'getSchemaInfo',
  description:
    'Get schema information for one or all database tables. Returns column names and types. Use this to understand what data is available before querying.',
  inputSchema: z.object({
    table: z
      .enum(['customers', 'products', 'purchases'])
      .optional()
      .describe(
        'Specific table to get schema for. If omitted, returns all table schemas.',
      ),
  }),
  outputSchema: z.object({
    schemas: z.record(z.string(), z.record(z.string(), z.string())),
    rowCounts: z.record(z.string(), z.number()),
  }),
}).server(async ({ table }) => {
  const db = getDatabase()
  const tables: Array<Table> = table
    ? [table]
    : ['customers', 'products', 'purchases']
  const schemas: Record<string, Record<string, string>> = {}
  const rowCounts: Record<string, number> = {}
  for (const t of tables) {
    schemas[t] = TABLE_SCHEMAS[t]
    const result = await db.pool.query(`SELECT COUNT(*) as count FROM "${t}"`)
    rowCounts[t] = parseInt(result.rows[0].count, 10)
  }
  return { schemas, rowCounts }
})

export const databaseTools = [queryTableTool, getSchemaInfoTool]

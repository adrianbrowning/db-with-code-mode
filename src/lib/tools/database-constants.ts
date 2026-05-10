export type Table = 'customers' | 'products' | 'purchases'

export const TABLE_SCHEMAS: Record<Table, Record<string, string>> = {
  customers: {
    id: 'number',
    name: 'string',
    email: 'string',
    city: 'string',
    joined: 'string (date)',
  },
  products: {
    id: 'number',
    name: 'string',
    category: 'string',
    price: 'number',
    stock: 'number',
  },
  purchases: {
    id: 'number',
    customer_id: 'number',
    product_id: 'number',
    quantity: 'number',
    total: 'number',
    purchased_at: 'string (date)',
  },
}

export const VALID_COLUMNS: Record<Table, Set<string>> = {
  customers: new Set(['id', 'name', 'email', 'city', 'joined']),
  products: new Set(['id', 'name', 'category', 'price', 'stock']),
  purchases: new Set(['id', 'customer_id', 'product_id', 'quantity', 'total', 'purchased_at']),
}

export const NUMERIC_COLUMNS = new Set(['id', 'price', 'stock', 'quantity', 'total', 'customer_id', 'product_id'])

export function convertRow(row: Record<string, unknown>): Record<string, unknown> {
  const converted: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (NUMERIC_COLUMNS.has(key) && typeof value === 'string') {
      converted[key] = parseFloat(value)
    } else if (value instanceof Date) {
      converted[key] = value.toISOString().split('T')[0]
    } else {
      converted[key] = value
    }
  }
  return converted
}

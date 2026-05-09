import {
  integer,
  pgTable,
  varchar,
  text,
  numeric,
  date,
} from 'drizzle-orm/pg-core'

export const posts = pgTable('posts', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: varchar({ length: 255 }).notNull(),
  content: text().notNull().default(''),
})

export const customers = pgTable('customers', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull(),
  city: varchar({ length: 255 }).notNull(),
  joined: date().notNull(),
})

export const products = pgTable('products', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 255 }).notNull(),
  category: varchar({ length: 255 }).notNull(),
  price: numeric({ precision: 10, scale: 2 }).notNull(),
  stock: integer().notNull(),
})

export const purchases = pgTable('purchases', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  customer_id: integer()
    .notNull()
    .references(() => customers.id),
  product_id: integer()
    .notNull()
    .references(() => products.id),
  quantity: integer().notNull(),
  total: numeric({ precision: 10, scale: 2 }).notNull(),
  purchased_at: date().notNull(),
})

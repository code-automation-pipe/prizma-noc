import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  shop_id: integer('shop_id').notNull().unique(),
  outlook_email: text('outlook_email').notNull(),
  outlook_credentials: text('outlook_credentials').notNull(), // AES-256-GCM encrypted JSON
  draft_alert_threshold: integer('draft_alert_threshold').notNull().default(10),
  last_draft_count: integer('last_draft_count').notNull().default(0),
  last_draft_snapshot_at: timestamp('last_draft_snapshot_at'),
  created_at: timestamp('created_at').notNull().defaultNow(),
})

export const etsy_messages = pgTable('etsy_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  store_id: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  message_id: text('message_id').notNull().unique(), // Graph API message ID — dedup key
  sender_name: text('sender_name').notNull(),
  subject: text('subject').notNull(),
  received_at: timestamp('received_at').notNull(),
  is_read: boolean('is_read').notNull().default(false),
  created_at: timestamp('created_at').notNull().defaultNow(),
})

export const alert_rules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  store_id: uuid('store_id').references(() => stores.id, { onDelete: 'cascade' }), // null = global
  service: text('service'), // null | 'oxylabs' | 'gemini' | 'tmapi' | 'modal'
  rule_type: text('rule_type').notNull(), // low_drafts | api_budget | api_balance | unread_message | zero_publishing
  threshold: numeric('threshold').notNull(),
  enabled: boolean('enabled').notNull().default(true),
})

export const triggered_alerts = pgTable('triggered_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  rule_id: uuid('rule_id')
    .notNull()
    .references(() => alert_rules.id, { onDelete: 'cascade' }),
  store_id: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
  message: text('message').notNull(),
  triggered_at: timestamp('triggered_at').notNull().defaultNow(),
})

export const api_ledger = pgTable('api_ledger', {
  id: uuid('id').primaryKey().defaultRandom(),
  service: text('service').notNull(), // gemini | tmapi | modal
  entry_type: text('entry_type').notNull(), // topup | spend
  amount: numeric('amount').notNull(), // USD, always positive
  note: text('note'),
  created_at: timestamp('created_at').notNull().defaultNow(),
})

// Inferred types
export type Store = typeof stores.$inferSelect
export type NewStore = typeof stores.$inferInsert
export type EtsyMessage = typeof etsy_messages.$inferSelect
export type NewEtsyMessage = typeof etsy_messages.$inferInsert
export type AlertRule = typeof alert_rules.$inferSelect
export type NewAlertRule = typeof alert_rules.$inferInsert
export type TriggeredAlert = typeof triggered_alerts.$inferSelect
export type ApiLedgerEntry = typeof api_ledger.$inferSelect
export type NewApiLedgerEntry = typeof api_ledger.$inferInsert

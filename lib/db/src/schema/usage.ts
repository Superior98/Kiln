import { integer, text, timestamp, uniqueIndex, pgTable } from 'drizzle-orm/pg-core';

export const modelUsageDailyTable = pgTable('kiln_model_usage_daily', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  usageDate: text('usage_date').notNull(),
  requests: integer('requests').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userDateUnique: uniqueIndex('kiln_model_usage_daily_user_date_unique').on(table.userId, table.usageDate),
}));

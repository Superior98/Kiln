import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const subscriptionsTable = pgTable(
  "kiln_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("inactive"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdUnique: uniqueIndex("kiln_subscriptions_user_id_unique").on(table.userId),
    stripeSubscriptionUnique: uniqueIndex("kiln_subscriptions_stripe_subscription_id_unique").on(table.stripeSubscriptionId),
  }),
);

export type KilnSubscription = typeof subscriptionsTable.$inferSelect;
export type NewKilnSubscription = typeof subscriptionsTable.$inferInsert;

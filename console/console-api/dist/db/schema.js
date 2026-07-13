import { pgTable, varchar, text, decimal, integer, jsonb, timestamp, uuid, bigint, } from 'drizzle-orm/pg-core';
// --- Auth Service managed tables (read-only for Console) ---
export const orgs = pgTable('orgs', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 255 }),
    role: varchar('role', { length: 50 }).notNull().default('developer'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const apiKeys = pgTable('api_keys', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    orgId: uuid('org_id').notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
    keyPrefix: varchar('key_prefix', { length: 10 }).notNull(),
    name: varchar('name', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    quotaLimits: jsonb('quota_limits').default({}),
    lastUsedAt: timestamp('last_used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
});
// --- Console-managed tables ---
export const models = pgTable('models', {
    id: varchar('id', { length: 100 }).primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    contextLength: integer('context_length').notNull().default(4096),
    pricingPer1kInput: decimal('pricing_per_1k_input').notNull().default('0'),
    pricingPer1kOutput: decimal('pricing_per_1k_output').notNull().default('0'),
    capabilities: jsonb('capabilities').default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
export const billingSummary = pgTable('billing_summary', {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    yearMonth: varchar('year_month', { length: 7 }).notNull(),
    totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
    totalCost: decimal('total_cost').notNull().default('0'),
});
// raw_usage_events — written by Gateway, Console reads only
export const rawUsageEvents = pgTable('raw_usage_events', {
    requestId: varchar('request_id', { length: 255 }).primaryKey(),
    apiKeyId: varchar('api_key_id', { length: 255 }),
    userId: varchar('user_id', { length: 255 }),
    orgId: varchar('org_id', { length: 255 }),
    modelId: varchar('model_id', { length: 100 }),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    status: varchar('status', { length: 20 }),
});

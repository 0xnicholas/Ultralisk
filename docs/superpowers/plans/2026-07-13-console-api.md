# Console API Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Migrate Console API from pure mock fixtures to real PostgreSQL + Auth Service integration for 7 route groups; keep 12 low-priority route groups on mock.

**Architecture:** Existing TypeScript Express app refactored into route modules. drizzle-orm for DB. Auth Service for login only. Direct PG read/write for /me, /keys, models, org, usage, billing.

**Tech Stack:** TypeScript, Express 5, drizzle-orm, pg, pino (logging).

**Spec:** `docs/superpowers/specs/2026-07-13-console-api-design.md`

**Pre-requisite:** Gateway login/logout exemption (Task 0 below).

---

## File Map

```
console/console-api/
├── package.json                   # + drizzle-orm, pg, pino
├── src/
│   ├── index.ts                   # Rewritten: imports route modules
│   ├── fixtures.ts                # Retained: 12 mock route groups
│   ├── db/
│   │   ├── index.ts               # drizzle-orm init + pg Pool
│   │   └── schema.ts              # models, billing_summary tables
│   ├── routes/
│   │   ├── auth.ts                # /v1/admin/auth/login, logout, me
│   │   ├── apiKeys.ts             # /v1/admin/api-keys CRUD
│   │   ├── models.ts              # /v1/admin/models
│   │   ├── organization.ts        # /v1/admin/organization
│   │   ├── usage.ts               # /v1/admin/usage
│   │   ├── billing.ts             # /v1/admin/billing
│   │   └── playground.ts          # /v1/chat/completions → forward Gateway
│   └── services/
│       └── authService.ts         # POST /login to Auth Service
├── drizzle/
│   └── 001_console.sql            # models + billing_summary DDL
```

---

### Task 0: Gateway Login/Logout Exemption

**Files:** Update `gateway/src/app.rs`

- [ ] **Step 1: Split admin router into public + protected routes**

```rust
// In build(): replace the single admin_router with:

let admin_public = Router::new()
    .route("/v1/admin/auth/login", post(admin_handler))
    .route("/v1/admin/auth/logout", post(admin_handler));

let admin_protected = Router::new()
    .route("/v1/admin/{*path}", any(admin_handler))
    .with_state(app_state.clone())
    .route_layer(middleware::from_fn_with_state(auth_state, auth::authenticate));

let admin_router = admin_public.merge(admin_protected);
```

- [ ] **Step 2: `cargo check` + `cargo test -- --test-threads=1`**

- [ ] **Step 3: Commit**

```bash
git add gateway/src/app.rs
git commit -m "fix(gateway): exempt /v1/admin/auth/login and /logout from auth middleware"
```

---

### Task 1: Dependencies + DB Setup

**Files:**
- Update: `console/console-api/package.json`
- Create: `console/console-api/src/db/index.ts`
- Create: `console/console-api/src/db/schema.ts`
- Create: `console/console-api/drizzle/001_console.sql`

- [ ] **Step 1: Add dependencies**

```bash
cd console/console-api
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
```

- [ ] **Step 2: Create DB connection module `src/db/index.ts`**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/ultralisk',
});

export const db = drizzle(pool, { schema });
export { pool };
```

- [ ] **Step 3: Create schema `src/db/schema.ts`**

```typescript
import { pgTable, varchar, text, decimal, integer, jsonb, timestamp, uuid, bigint } from 'drizzle-orm/pg-core';

// --- Read-only tables (managed by Auth Service) ---
export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: varchar('display_name', { length: 255 }),
  role: varchar('role', { length: 50 }).notNull().default('developer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
  keyPrefix: varchar('key_prefix', { length: 10 }).notNull(),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  quotaLimits: jsonb('quota_limits').default({}),
  lastUsedAt: timestamp('last_used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
});

// --- Console-owned tables ---
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
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  yearMonth: varchar('year_month', { length: 7 }).notNull(),
  totalTokens: bigint('total_tokens', { mode: 'number' }).notNull().default(0),
  totalCost: decimal('total_cost').notNull().default('0'),
});

// raw_usage_events is written by Gateway, Console only reads
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
```

- [ ] **Step 4: Create migration SQL**

```sql
CREATE TABLE IF NOT EXISTS models (
    id              VARCHAR(100) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    provider        VARCHAR(100) NOT NULL,
    description     TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    context_length  INTEGER NOT NULL DEFAULT 4096,
    pricing_per_1k_input   DECIMAL(10,6) NOT NULL DEFAULT 0,
    pricing_per_1k_output  DECIMAL(10,6) NOT NULL DEFAULT 0,
    capabilities    JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billing_summary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL REFERENCES orgs(id),
    year_month      VARCHAR(7) NOT NULL,
    total_tokens    BIGINT NOT NULL DEFAULT 0,
    total_cost      DECIMAL(12,6) NOT NULL DEFAULT 0,
    UNIQUE(org_id, year_month)
);

-- Seed models
INSERT INTO models (id, name, provider, description, context_length, pricing_per_1k_input, pricing_per_1k_output, capabilities) VALUES
  ('llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct', 'Meta', '8B parameter instruct model', 131072, 0.00006, 0.00006, '["chat","completion"]'),
  ('llama-3.3-70b-instruct', 'Llama 3.3 70B Instruct', 'Meta', '70B parameter instruct model', 131072, 0.00059, 0.00079, '["chat","completion"]')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 5: Run migration**

```bash
psql $DATABASE_URL -f drizzle/001_console.sql
```

- [ ] **Step 6: `pnpm build` — verify TypeScript compiles**

- [ ] **Step 7: Commit**

```bash
git add console/console-api/src/db/ console/console-api/drizzle/ console/console-api/package.json
git commit -m "feat(console-api): drizzle-orm setup, DB schema, seed models"
```

---

### Task 2: Auth Routes (login, logout, me)

**Files:**
- Create: `console/console-api/src/routes/auth.ts`
- Create: `console/console-api/src/services/authService.ts`

- [ ] **Step 1: Create `src/services/authService.ts`**

```typescript
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3101';

export async function login(email: string, password: string) {
  const res = await fetch(`${AUTH_SERVICE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'auth_service_error' }));
    throw Object.assign(new Error(err.error || 'Login failed'), { status: res.status });
  }
  return res.json();
}
```

- [ ] **Step 2: Create `src/routes/auth.ts`**

```typescript
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, orgs, apiKeys } from '../db/schema';
import { eq } from 'drizzle-orm';
import { login } from '../services/authService';

const router = Router();

// POST /v1/admin/auth/login → forward to Auth Service
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    // Set JWT as httpOnly cookie
    res.cookie('jwt', result.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600 * 1000, // 1 hour
    });
    res.json({ data: result });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /v1/admin/auth/logout
router.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('jwt');
  res.json({ data: { ok: true } });
});

// GET /v1/admin/auth/me — direct PG read (trust Gateway-injected X-User-Id)
router.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: 'user_not_found' });

    const [org] = await db.select().from(orgs).where(eq(orgs.id, user.orgId)).limit(1);
    const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));

    res.json({
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        org: org ? { id: org.id, name: org.name } : null,
        apiKeys: keys.map(k => ({
          id: k.id,
          keyPrefix: k.keyPrefix,
          name: k.name,
          status: k.status,
          lastUsedAt: k.lastUsedAt,
          createdAt: k.createdAt,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd console/console-api && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add console/console-api/src/routes/ console/console-api/src/services/
git commit -m "feat(console-api): auth routes — login (Auth Service), me (PG), logout"
```

---

### Task 3: API Keys Routes

**Files:**
- Create: `console/console-api/src/routes/apiKeys.ts`

- [ ] **Step 1: Create `src/routes/apiKeys.ts`**

Key logic:
- GET: query `api_keys` WHERE user_id = X-User-Id
- POST: generate `ultr_` + 32 random → SHA-256 → INSERT
- DELETE: UPDATE status = 'revoked'
- Use Node.js `crypto.createHash('sha256')` for hashing

- [ ] **Step 2: Verify & commit**

---

### Task 4: Models, Organization, Usage, Billing, Playground Routes

**Files:**
- Create: `console/console-api/src/routes/models.ts`
- Create: `console/console-api/src/routes/organization.ts`
- Create: `console/console-api/src/routes/usage.ts`
- Create: `console/console-api/src/routes/billing.ts`
- Create: `console/console-api/src/routes/playground.ts`

Each route module: export an Express Router with 1-2 routes, reading from PG.

**Playground**: forward `POST /v1/chat/completions` to Gateway (GATEWAY_URL env var).

- [ ] **Step 1: Create all route files**
- [ ] **Step 2: Verify & commit**

---

### Task 5: Refactor index.ts

**Files:**
- Update: `console/console-api/src/index.ts`

- [ ] **Step 1: Rewrite index.ts to import route modules**

```typescript
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import apiKeyRoutes from './routes/apiKeys.js';
import modelRoutes from './routes/models.js';
import orgRoutes from './routes/organization.js';
import usageRoutes from './routes/usage.js';
import billingRoutes from './routes/billing.js';
import playgroundRoutes from './routes/playground.js';

const app = express();
app.use(cors());
app.use(express.json());

// Real data routes
app.use('/v1/admin', authRoutes);
app.use('/v1/admin', apiKeyRoutes);
app.use('/v1/admin', modelRoutes);
app.use('/v1/admin', orgRoutes);
app.use('/v1/admin', usageRoutes);
app.use('/v1/admin', billingRoutes);
app.use('/v1', playgroundRoutes);

// Mock routes (12 groups retained from fixtures.ts)
// ... import from './fixtures.js' for remaining groups ...

app.listen(3100, () => console.log('Console API on :3100'));
```

- [ ] **Step 2: Keep fixtures.ts for remaining 12 route groups**

- [ ] **Step 3: Test: `pnpm dev` + curl against all 7 migrated routes**

- [ ] **Step 4: Commit**

```bash
git add console/console-api/src/index.ts
git commit -m "refactor(console-api): modular routes — 7 real + 12 mock"
```

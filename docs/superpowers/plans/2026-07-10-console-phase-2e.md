# Ultralisk Console Phase 2e — Organization & RBAC

**Goal:** Add Organization management pages — Members (with roles), General settings, and enhanced Organization sidebar section.

**Scope:** Small — 2 pages + sidebar update.

---

## Task 1: Stub API

- [ ] Append to `fixtures.ts`:

```typescript
export const MOCK_ORGANIZATION = {
  id: 'org_001', name: 'Ultralisk Labs', billing_email: 'billing@ultralisk.com',
  plan: 'pro', created_at: '2026-01-01T00:00:00Z',
  members: [
    { id: 'usr_001', email: 'alice@ultralisk.com', name: 'Alice Developer', role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
    { id: 'usr_002', email: 'bob@ultralisk.com', name: 'Bob Engineer', role: 'developer', joined_at: '2026-02-15T00:00:00Z' },
    { id: 'usr_003', email: 'carol@ultralisk.com', name: 'Carol Viewer', role: 'readonly', joined_at: '2026-03-01T00:00:00Z' },
  ],
  projects: [
    { id: 'proj_001', name: 'Production', member_count: 2 },
    { id: 'proj_002', name: 'Development', member_count: 3 },
    { id: 'proj_003', name: 'ML Research', member_count: 1 },
  ],
};
```

- [ ] Add endpoints to `index.ts`:

```typescript
app.get('/v1/admin/organization', (_req, res) => res.json({ data: MOCK_ORGANIZATION }));
app.patch('/v1/admin/organization', (req, res) => { Object.assign(MOCK_ORGANIZATION, req.body); res.json({ data: MOCK_ORGANIZATION }); });
```

- [ ] Commit

## Task 2: UI Pages

- [ ] Add types:

```typescript
export interface OrgMember { id: string; email: string; name: string; role: string; joined_at: string; }
export interface OrgProject { id: string; name: string; member_count: number; }
export interface Organization { id: string; name: string; billing_email: string; plan: string; created_at: string; members: OrgMember[]; projects: OrgProject[]; }
```

- [ ] Create `api/organization.ts`, `hooks/useOrganization.ts`

- [ ] Create `pages/settings/OrganizationPage.tsx` — org name, plan badge, member table with role badges, invite button (stub), projects list

- [ ] Update sidebar: add "Members" and "Organization" items to Organization section:
```typescript
{ label: 'Organization', icon: IconBuilding, path: '/settings/organization' },
```

- [ ] Add route: `/settings/organization`

- [ ] Typecheck, commit, build

---

**2 tasks, ~30 min.**

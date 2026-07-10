# Ultralisk Console Phase 2d — AI-Assisted Diagnostics

> **The core differentiator.** Incidents + AI root cause analysis + chat assistant + auto-remediation + Slack ChatOps.

**Goal:** Build the full Incidents management system with AI-powered diagnostics — automatically detect anomalies, run LLM root cause analysis, provide a conversational AI assistant, tiered auto-remediation, and Slack integration.

**Architecture:** 5 sub-modules: Incidents list/detail pages, AI chat panel (web), Auto-Remediation settings, Slack integration settings. Stub backend serves mock incidents with pre-generated AI analysis.

**Tech Stack:** React 19.2, Mantine v9, @mantine/charts, @tanstack/react-query, React Router v7

**Reference specs:** Design §7.7 (§7.7.1–§7.7.10), Competitive analysis §2.7 (Chambie gap closed)

---

## File Structure

```
packages/console-ui/src/
├── types/index.ts                           # MODIFY: add Incident, Alert, AutoRemediation types
├── api/
│   ├── incidents.ts                         # CREATE
│   └── alerts.ts                            # CREATE
├── hooks/
│   ├── useIncidents.ts                      # CREATE
│   └── useAlerts.ts                         # CREATE
├── pages/
│   ├── incidents/
│   │   ├── IncidentsPage.tsx                # CREATE (list)
│   │   └── IncidentDetailPage.tsx           # CREATE (3-column detail)
│   └── settings/
│       ├── OperationsSettingsPage.tsx       # CREATE (auto-remediation config)
│       └── IntegrationsPage.tsx             # CREATE (Slack config)
├── components/
│   ├── incidents/
│   │   ├── IncidentList.tsx                 # CREATE
│   │   ├── IncidentTimeline.tsx             # CREATE (left column)
│   │   ├── IncidentMetricsPanel.tsx         # CREATE (center column)
│   │   └── AiAssistantPanel.tsx             # CREATE (right column - chat)
│   └── settings/
│       ├── AutoRemediationPolicy.tsx         # CREATE
│       └── SlackIntegration.tsx             # CREATE

packages/console-api/src/
├── fixtures.ts                              # MODIFY: add incidents, alerts
└── index.ts                                 # MODIFY: add /v1/admin/incidents, /alerts endpoints
```

---

## Task 1: Stub API — Incidents, Alerts, AI Analysis

- [ ] Append mock fixtures — 6 mock incidents with full AI analysis results, mock alerts, mock auto-remediation config, mock Slack config
- [ ] Add endpoints: GET/PATCH incidents, GET/PATCH alerts, POST incident actions, GET auto-remediation config, GET Slack config
- [ ] Verify and commit

## Task 2: Types, Route, Sidebar Updates

- [ ] Add Incident, Alert, AutoRemediationPolicy, SlackConfig types
- [ ] Create API/hook files
- [ ] Add routes: /incidents, /incidents/:id, /settings/operations, /settings/integrations
- [ ] Add Sidebar items: Incidents (Operations), Operations Settings, Integrations (Settings)
- [ ] Commit

## Task 3: Incidents List Page

- [ ] IncidentList: table with severity badge (🔴/🟡), status, type, affected entities, duration, AI analysis status
- [ ] Filters: severity select, status select, cluster select, time range
- [ ] IncidentsPage: title, filters bar, table
- [ ] Commit

## Task 4: Incident Detail + AI Chat Panel

- [ ] **IncidentDetailPage**: 3-column responsive layout
  - Left: IncidentTimeline (events + action log)
  - Center: IncidentMetricsPanel (Grafana-style metric cards, anomaly highlight)
  - Right: AiAssistantPanel (analysis results + chat input)
- [ ] **AiAssistantPanel**: Auto-loads initial analysis, shows root causes with confidence/probability bars, chat input for follow-up questions, conversation history
- [ ] **IncidentTimeline**: Auto-generated incident events, action log entries with timestamps
- [ ] Commit

## Task 5: Auto-Remediation + Slack Settings Pages

- [ ] **AutoRemediationPolicy**: Tier 1/2/3 checkboxes per operation, approval channel select, auto-suppression config (matching spec §7.7.5 diagram exactly)
- [ ] **SlackIntegration**: Connection status badge, test webhook button, incident notification toggles, slash command info
- [ ] **OperationsSettingsPage** + **IntegrationsPage**
- [ ] Commit, build, verify

---

## Summary

| Sub-module | Pages | Key Components |
|-----------|-------|---------------|
| Incidents | List + Detail | IncidentList, IncidentTimeline, IncidentMetricsPanel |
| AI Assistant | Detail panel (right) | AiAssistantPanel (LLM analysis + chat) |
| Auto-Remediation | `/settings/operations` | AutoRemediationPolicy (Tier 1/2/3 config) |
| Slack Integration | `/settings/integrations` | SlackIntegration (connection + notification toggles) |

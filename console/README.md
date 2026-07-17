# Ultralisk Console

Management UI + REST API for the Ultralisk inference cloud.

Two packages in a pnpm workspace:

- `console-api/` — Node/Express + PostgreSQL. All `/v1/admin/*` routes; serves UI bundle in prod.
- `console-ui/` — React 19 + Mantine v9 + Vite. Vite dev server proxies `/v1/*` to the API.

Both share a deployment mode (`DEPLOYMENT_MODE=saas|private`) that gates
mode-specific routes (Billing / API Keys vs. Setup Wizard / Audit Logs /
Compliance / License / SSO). See
`docs/superpowers/specs/2026-07-17-console-private-deployment-design.md`
for the full SaaS / Private split.

## Quick start (dev)

```bash
pnpm install
bash ../scripts/dev.sh start    # api + ui in background; logs in /tmp/
bash ../scripts/dev.sh status   # check ports / pids
bash ../scripts/dev.sh logs     # tail both logs (Ctrl-C to stop tailing)
bash ../scripts/dev.sh stop     # SIGTERM, then SIGKILL after grace period
bash ../scripts/dev.sh restart  # stop + start
bash ../scripts/dev.sh clean    # kill zombies, free :3100 + :5173
```

The API expects PostgreSQL. Defaults are pinned to
`postgres://postgres:postgres@localhost:5432/ultralisk_console`; override with
`DATABASE_URL`. Migrations auto-run on startup and are tracked in
`schema_migrations`, so re-running on a clean DB is idempotent.

### Environment variables

| Var                       | Default                                                                                          | Notes                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | `postgres://postgres:postgres@localhost:5432/ultralisk_console`                                 | Always set this — the script pins it, but custom shells may leak other values.                                         |
| `JWT_SECRET`              | `dev-secret-change-in-production`                                                                | **Must override in production.** Used by `/auth/login` to mint dev JWTs and to verify all tokens.                    |
| `DEPLOYMENT_MODE`         | `saas`                                                                                           | `saas` enables Billing/API Keys; `private` enables Setup Wizard/Audit Logs/Compliance/License/SSO.                     |
| `NODE_ENV`                | (unset)                                                                                          | When `production`, dev login fallback is disabled and CORS becomes restrictive.                                        |
| `ALLOW_DEV_LOGIN`         | (unset)                                                                                          | Set `false` to disable dev login even in dev mode (the Dev Login button on `/login` will 503).                          |
| `CORS_ORIGINS`            | (unset)                                                                                          | Prod-only. Comma-separated allowlist. Empty value = same-origin only. Dev stays permissive.                            |
| `LOG_LEVEL`               | `info` (prod) / `debug` (dev)                                                                    | pino level.                                                                                                            |
| `PORT`                    | `3100`                                                                                           | API port.                                                                                                              |
| `VITE_PORT`               | `5173`                                                                                           | UI port.                                                                                                               |
| `AUTH_SERVICE_URL`        | `http://localhost:3101`                                                                         | Only used by `console-api` if it needs to call auth-service.                                                            |

## Scripts

```
../scripts/
├── dev-start.sh     launch api+ui detached, logs in /tmp
├── dev-stop.sh      SIGTERM, then SIGKILL after GRACE_SECONDS (default 5)
├── dev-restart.sh   stop + start
├── dev-clean.sh     nuke zombies + free ports (EADDRINUSE recovery)
└── dev.sh           dispatcher: start|stop|restart|status|logs|clean|help
```

Pid files: `/tmp/ultralisk-api.pid`, `/tmp/ultralisk-ui.pid`.
Log files: `/tmp/ultralisk-api.log`, `/tmp/ultralisk-ui.log`.

The `console-ui/scripts/postbuild-smoke.sh` script is package-internal —
it grep's the console-ui build output for dev-only strings and runs as
part of `pnpm --filter @ultralisk/console-ui build`.

## Quality gates

```bash
cd console
pnpm lint          # eslint (console-ui only)
pnpm typecheck     # tsc --noEmit, both packages
pnpm test          # vitest run, both packages
pnpm build         # vite build + tsc emit
```

These run on every PR via `.github/workflows/ci.yml`. The Rust
gateways / auth-service / zealot have their own matrix job.

## API conventions

- Auth: `Authorization: Bearer <jwt>` (HS256, shared secret with auth-service).
  Middleware sets `x-user-id` / `x-org-id` request headers consumed by
  every route. Inbound `X-Request-Id` is reused when valid (`^[A-Za-z0-9._-]{1,128}$`),
  otherwise a fresh UUID is generated and echoed on the response.
- Every request emits one structured access log on response finish
  with `{ req_id, method, path, status, duration_ms }`.
- Errors: `{ error: { code: "...", message: "..." } }` with appropriate
  4xx / 5xx status.
- Mutations (POST/PUT/PATCH/DELETE) are recorded to `audit_logs` via
  middleware.

## Health probes (k8s)

```
GET /health       liveness — process up, no DB hit
GET /health/ready readiness — DB SELECT 1 with 1.5s timeout, returns per-check latency_ms
```

Both unauthenticated; mounted before the auth gate.

## Layout

```
console/
├── console-api/
│   ├── drizzle/        SQL migrations (001-007)
│   ├── src/
│   │   ├── db/         pg pool + migrate runner
│   │   ├── middleware/ auth + request-id
│   │   ├── routes/     one file per resource
│   │   ├── services/   authService, usageCron, auditLog
│   │   ├── logger.ts   pino instance
│   │   └── index.ts    app wiring
│   └── tests are colocated as *.test.ts
├── console-ui/
│   ├── src/
│   │   ├── api/        typed fetch wrappers
│   │   ├── components/ shared UI (sidebar, top bar, error boundary)
│   │   ├── hooks/      react-query wrappers
│   │   ├── layouts/    ConsoleLayout (AppShell + Outlet)
│   │   ├── pages/      one file per route
│   │   ├── private/    private-mode-only pages (Setup Wizard, Audit Logs, …)
│   │   ├── stores/     AuthContext (provider) + useAuth (hook)
│   │   └── types/      shared API DTOs
│   └── public/         static assets (favicon, …)
└── scripts/            dev lifecycle scripts
```

See `../AGENTS.md` (repo root) for architectural overview and ADR links.
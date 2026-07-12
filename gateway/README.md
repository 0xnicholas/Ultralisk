# Ultralisk Gateway

AI inference gateway — entry point for all chat completions and admin traffic.

## Quick Start

```bash
# Set required env
export DATABASE_URL="postgres://localhost:5432/ultralisk"
export REDIS_URL="redis://localhost:6379"

# Start Gateway
cargo run
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/chat/completions` | Inference requests → vLLM |
| Any | `/v1/admin/*` | Management → Console API |
| GET | `/health` | Liveness (no IO) |
| GET | `/ready` | Readiness (Redis + route table) |
| GET | `/metrics` | Prometheus metrics |

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `8080` | Listen port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `AUTH_SERVICE_URL` | `http://localhost:3101` | Auth Service for key validation |
| `CONSOLE_API_URL` | `http://localhost:3100` | Console API upstream |
| `DATABASE_URL` | *required* | PostgreSQL for usage events |
| `RATE_LIMIT_WINDOW_SECS` | `60` | Sliding window duration |
| `RATE_LIMIT_ENABLED` | `true` | Enable rate limiting |
| `AUTH_CACHE_TTL_SECS` | `60` | Redis auth cache TTL |
| `UPSTREAM_TIMEOUT_SECS` | `60` | vLLM timeout |
| `ADMIN_UPSTREAM_TIMEOUT_SECS` | `30` | Console API timeout |
| `ROUTE_TABLE_PATH` | `config/route_table.json` | Route table config file |
| `MAX_BODY_SIZE` | `10485760` (10MB) | Max request body |
| `SHUTDOWN_DRAIN_SECS` | `30` | Graceful shutdown drain |
| `LOG_LEVEL` | `info` | Tracing log level (via `RUST_LOG`) |

## Processing Pipeline

```
Auth → Body Parse → Route Resolution → Rate Limit → Proxy → Response
  │         │              │                │           │
  Redis    ChatRequest    RouteTable      Redis        vLLM
  + Auth   extractor       (ArcSwap)    sorted set    SSE tee
  Service                                sliding       + usage
                                         window        write
```

## Testing

```bash
# Unit tests (must run sequentially due to global state)
cargo test -- --test-threads=1

# Integration tests (requires Docker for testcontainers)
cargo test --test integration -- --test-threads=1
```

## Route Table Format

`config/route_table.json`:

```json
{
  "version": 1,
  "routes": {
    "llama-3.1-8b-instruct": {
      "name": "serverless-llama8b",
      "strategy": "serverless",
      "pods": [
        {"id": "vllm-8b-01", "address": "localhost:8000", "weight": 1}
      ]
    }
  }
}
```

## Architecture

Single axum binary. Tower middleware for auth and observe. Axum extractor for body parsing. ArcSwap for route table hot-reload (Phase 2). Redis for auth cache and rate limit state. PostgreSQL for usage events.

See `docs/adr/002-gateway.md` for full architecture specification.

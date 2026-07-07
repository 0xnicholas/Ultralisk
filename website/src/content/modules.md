---
title: Modules
description: "Four modules: auth & quota, observability, safety, logging & tracing. Pluggable, production-grade, open source."
navTitle: Modules
---

Ultralisk ships four independent modules. Use what you need, swap what you don't.

## Auth & Quota

**Stop runaway usage before it hits your GPU bill. Daily and monthly quotas return 429s the moment a caller crosses the line.**

- API Key authentication at the gateway
- QPS rate limits (per consumer tier)
- Daily and monthly token quotas
- Clear 429 responses with `Retry-After` header

Learn more: [README § 模块一:鉴权与限流](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%B8%80%E9%89%B4%E6%9D%83%E4%B8%8E%E9%99%90%E6%B5%81)

## Observability

**See latency and error rates at every stage. TTFT, queue depth, and quota rejections — Prometheus metrics out of the box.**

- TTFT, TPOT, throughput metrics
- GPU utilization + memory tracking
- Per-stage error breakdown (safety, quota, inference)
- Grafana dashboards ready to import

Learn more: [README § 模块二:监控](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%BA%8C%E7%9B%91%E6%8E%A7)

## Safety

**Catch jailbreak prompts and sensitive output before it reaches the user. Rule engine first, model second, both async-friendly.**

- DFA-based jailbreak + sensitive-word detection
- Async moderation model (Llama Guard compatible)
- Streaming-safe output sanitization
- Block / redact / log actions per stage

Learn more: [README § 模块三:内容安全](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%B8%89%E5%86%85%E5%AE%B9%E5%AE%89%E5%85%A8)

## Logging & Tracing

**Reconstruct any request end-to-end from a single `request_id`. Structured JSON + OTel spans, ready for Loki or Tempo.**

- One `request_id` per request, full timeline
- Structured JSON logs with token usage
- OTel spans across all stages
- Loki / Tempo ready

Learn more: [README § 模块四:日志与追踪](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E5%9B%9B%E6%97%A5%E5%BF%97%E4%B8%8E%E8%BF%BD%E8%B8%AA)
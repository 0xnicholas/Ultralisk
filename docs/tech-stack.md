# 技术选型(Tech Stack)

本文件是 [AGENTS.md](../AGENTS.md) 四个基础设施模块的**技术选型与落地说明**。AGENTS.md 描述"要做什么"(需求与验收标准),本文件描述"用什么做、为什么"。

选型原则(与 AGENTS.md 一致):
- 优先成熟开源组件,避免重复造轮子
- 与推理引擎(vLLM / TGI / SGLang)解耦
- 面向生产对外服务,模型与硬件规模待定,需保留弹性

---

## 整体架构

```
用户请求
   ↓
[Kong / APISIX 网关] —— 鉴权 + QPS 限流 (Redis 计数)
   ↓
[输入安全检测] —— 规则引擎(同步) + Llama Guard / 审核模型
   ↓
[vLLM / TGI 推理服务] —— 自带 Prometheus 指标
   ↓
[输出安全检测] —— Llama Guard / 审核模型(流式边出边审)
   ↓
返回用户 ──→ 推理返回后回写 token 用量到 Redis/PG(长期配额)
   ↓
[Fluent Bit 采集日志] → Loki / ES
[Prometheus 抓取指标] → Grafana 展示 + Alertmanager 告警
```

---

## 模块一:鉴权与限流

| 选型 | 推荐 | 理由 |
|---|---|---|
| API 网关 | **Kong** 或 **APISIX** | 开源、插件生态成熟,内置 `key-auth`、`rate-limiting` 插件;云厂商托管网关(AWS API Gateway / 阿里云 API 网关)可减少运维 |
| 限流算法 | 网关内置**滑动窗口**插件 | 比固定窗口更平滑,避免窗口边界突发流量 |
| Key / 计数存储 | **Redis** | 限流计数天然适配 `INCR` + `EXPIRE`,高频读写 |
| 长期配额 | 自建配额服务,落 **PostgreSQL** | 短期计数用 Redis,按月配额落库,避免 Redis 重启丢数据 |

**Kong vs APISIX**:偏国内生态 / 追求更轻量高性能选 **APISIX**(etcd + Lua);要更成熟文档与社区选 **Kong**。

**轻量替代**:不想引入完整网关时,可用 **FastAPI + slowapi** 或 **Envoy + rate limit service** 自搭一层,适合小团队、想要更多控制权。

### ✅ 落地实现:日 Redis + 月 PG 写穿
- 日计数留 Redis(`INCR`+`EXPIRE`,高频、短生命周期,重启丢一天影响小)。
- 月计数 **write-through upsert 到 PostgreSQL**(`INSERT ... ON CONFLICT DO UPDATE SET tokens=tokens+N RETURNING`),原子累加、**崩溃不丢**,关乎配额/成本。
- 实现:`app/quota/sql_store.py:SqlMonthlyStore`(实现 `CounterStore` 接口,与 Redis/内存可互换);表结构 `sql/monthly_usage.sql`。
- 保留清理:`SqlMonthlyStore.cleanup(keep_before_month)` 删除旧月数据,由定时任务调用。

### ⚠️ 落地关键坑:token 配额需自建
- QPS 限流网关插件能搞定;但**按天/月的 token 用量配额网关做不了**——网关不知道推理返回了多少 token。
- 必须在**推理返回后**,把 `input_tokens + output_tokens` 回写到 Redis(当日累计)/ PostgreSQL(长期),超限时拒绝或降级。
- 这块是自建逻辑,不要指望网关插件覆盖。

---

## 模块二:监控

| 选型 | 推荐 | 理由 |
|---|---|---|
| 指标采集 | **Prometheus** | 事实标准,vLLM/TGI 原生暴露 Prometheus `/metrics`(TTFT、TPOT、吞吐已内置),几乎零埋点成本 |
| 可视化 | **Grafana** | 与 Prometheus 天然搭配,vLLM 官方提供现成 Dashboard 模板可直接导入 |
| 告警 | **Alertmanager** | Prometheus 生态,规则(错误率、显存阈值)写好即可推送 Slack / 企业微信 / 钉钉 |
| 日志类监控(慢请求分析) | **Loki**(可选) | 想"指标 + 日志"统一在 Grafana 里看,Loki 最省心 |

**关键点**:vLLM/TGI 自带 Prometheus 指标输出,**推理代码内不需要自己埋点**,只需把 Prometheus 指向对应端口抓取即可,是四个模块里落地成本最低的。

### ⚠️ 补充:引擎级指标 ≠ 全链路指标
- vLLM 自带指标是**引擎级**的。网关层的**限流拒绝、鉴权失败、排队丢弃**等指标 Prometheus 抓不到引擎里。
- 需在网关 / 中间件层**单独暴露** `/metrics`(如用 prometheus client 库),否则请求成功率/错误率会失真。

---

## 模块三:内容安全

| 选型 | 推荐 | 理由 |
|---|---|---|
| 输出内容审核 | **Llama Guard**(Meta) 或 **Qwen 系审核模型** | 开源可自部署,专为 LLM 输出场景训练,比通用敏感词库更准 |
| 规则引擎兜底 | 自建敏感词库(**DFA 算法** / `sensitive-words` 库) | 审核模型有延迟和误判,规则引擎做第一层快速同步过滤 |
| Prompt Injection 检测 | **Rebuff**(开源) + Llama Guard | 专门检测越狱类攻击,规则 + 模型双重防护 |
| 第三方托管 | 云厂商内容安全 API(阿里云内容安全 / 腾讯云天御) | 国内合规场景常需有资质第三方审核,自建模型可能无法覆盖合规要求 |

### 🚩 阻塞项:合规先行(待与法务确认)
- 面向国内用户的对外服务,内容安全**很可能有强制合规要求**,这不完全是技术选型问题。
- **在动手实现前**,先确认业务所在地区监管要求,再决定"自建 vs 接入有资质第三方"。此项应视为实现前的**阻塞项**,不要自行假设。
- Llama Guard 以英文为主,中文效果一般;国内建议 **Qwen 系审核模型或第三方 API**。

### ⚠️ 落地关键坑:审核会叠加延迟
- 审核模型本身是**一次额外推理调用**,会叠加到端到端延迟上。
- 生产建议:**规则引擎同步跑**(毫秒级),**审核模型异步 / 流式边出边审**,避免审核成为整链路瓶颈。

### ✅ 落地实现:规则引擎 + 异步审核模型
- 规则引擎(DFA 敏感词 + 中英文越狱检测 + 超长/flooding):同步、毫秒级,输出侧 REDACT 脱敏。
- 审核模型(`app/safety/model_guard.py:ModelModerationGuard`):**通用 adapter**,接任意 OpenAI 兼容审核端点(Llama Guard/Qwen/自定义),**异步**不阻塞事件循环,补上 **BLOCK** 路径(unsafe -> 拦截)。
- **流式仅用规则引擎句界缓冲**(避免逐句调模型);审核模型仅用于非流式输出 + 输入侧。
- **fail-open/closed 可配**:审核服务宕机时默认 fail-open(可用性优先,记 metric)。⚠️ 合规场景可能需 fail-closed,上线前确认。

---

## 模块四:日志

| 选型 | 推荐 | 理由 |
|---|---|---|
| 日志采集 | **Fluent Bit** | 轻量、性能好,适合作为 sidecar 部署在推理服务旁采集 |
| 存储与查询 | **Loki**(推荐) 或 **Elasticsearch + Kibana** | 已上 Grafana 生态则 Loki 更轻、统一面板;ES 查询强但运维重 |
| 日志格式 | **JSON 结构化**,统一 schema | 结构化才能被高效解析与聚合(request_id、耗时、token 数等) |
| 全链路追踪 | **OpenTelemetry** | 后续架构变复杂(网关→队列→推理→审核)时,OTel 串起 request_id 做分布式追踪。✅ 已落地:`app/tracing.py` 手动流水线 span + 可选自动 FastAPI/httpx;保留 request_id 并注入 trace_id/span_id 到日志;未启用/未装依赖则全程 no-op |

**建议**:团队规模不大时 **Loki 优先**,不要一上来就 ELK(运维重)。

---

## 落地优先级(与 AGENTS.md 一致)

1. **API 网关骨架**(鉴权 + QPS 限流,Redis 计数)——后端可先接 mock 推理服务
2. **日志 schema**(JSON + OTel 规范)——尽早定 schema,避免后期大改
3. **监控埋点**(Prometheus 抓 vLLM/TGI + 网关自暴露指标)
4. **内容安全**(先确认合规 → 规则引擎兜底 → 审核模型 / 第三方)

## 待确认 / 阻塞项汇总

- [ ] **内容安全合规要求**:业务所在地区监管、是否必须接有资质第三方(与法务确认)
- [ ] **日志隐私策略**:保留周期、PII 脱敏字段、访问权限(与需求方/法务确认)
- [ ] **Kong vs APISIX** 最终二选一(视团队生态与运维偏好)
- [ ] **审核模型选型**:中英文场景权重决定 Llama Guard / Qwen / 第三方

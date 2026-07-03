# 日志字段 Schema(模块四)

对应 [AGENTS.md](../AGENTS.md) 模块四。日志为 **JSON 结构化**,一行一条,便于
Fluent Bit 采集、Loki/ES 聚合。字段命名尽量与 OpenTelemetry 语义约定兼容,
后续接 OTel 分布式追踪时可平滑对接。

实现:`app/logging_config.py`(`JsonFormatter` + `log_request`)。

## 请求级字段

| 字段 | 类型 | 说明 | 脱敏 |
|---|---|---|---|
| `ts` | string(ISO8601) | 日志时间戳(UTC) | 否 |
| `request_id` | string | 全局唯一,全链路追踪主键 | 否 |
| `trace_id` | string | OTel trace ID(启用追踪时),Loki↔Tempo 关联 | 否 |
| `span_id` | string | OTel span ID(启用追踪时) | 否 |
| `caller_id` | string | 调用方标识(API Key ID,**非明文 key**) | 否 |
| `model` | string | 使用的模型版本/名称 | 否 |
| `input_tokens` | int | 输入 token 数(成本核算) | 否 |
| `output_tokens` | int | 输出 token 数 | 否 |
| `queue_ms` | float | 排队耗时(引擎侧,后续接入) | 否 |
| `inference_ms` | float | 推理耗时 | 否 |
| `total_ms` | float | 端到端总耗时 | 否 |
| `status` | string | `ok` / `error` | 否 |
| `error_type` | string | 错误类型(reason 或异常类名) | 否 |
| `safety_input_action` | string | `allow` / `block` | 否 |
| `safety_output_action` | string | `allow` / `redact` / `block` | 否 |
| `prompt` | string | 输入内容 | **是(PII)** |
| `completion` | string | 输出内容 | **是(PII)** |

> `prompt` / `completion` 默认**不写入**请求日志(上面 `log_request` 未落这两字段),
> 需要留存时必须配合脱敏与访问控制,见下方待确认项。

## 耗时拆分

`total_ms = queue_ms + inference_ms + (网关/审核等其余开销)`。
`request_id` 可还原任意一次请求的全链路耗时与结果(AGENTS.md 验收标准)。

## 审核命中日志

内容安全命中时,除请求日志外还应记录:`stage`(input/output)、`category`、
`guard`(命中的 guard 名)、`reason`。用于后续迭代规则(AGENTS.md 模块三)。

## 🚩 待确认项(实现前与需求方/法务确认,勿自行假设)

- [ ] **保留周期**:如 30 / 90 天,到期自动清理(采集/存储侧配置 TTL / ILM)。
- [ ] **脱敏字段**:`prompt` / `completion` 等 PII 字段的脱敏规则(是否留存、如何掩码)。
- [ ] **访问权限**:谁能查询含用户输入的日志,避免未授权访问。

> 保留周期与脱敏在**采集/存储层**执行(Fluent Bit filter + Loki/ES 保留策略),
> 应用层只负责产出结构化字段,不在应用内做删除。

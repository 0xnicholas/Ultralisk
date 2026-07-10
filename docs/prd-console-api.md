# Ultralisk Console API 产品需求文档

> **状态**：v0.1（2026-07-10）  
> **范围**：Console 依赖的 Backend API，支撑 `docs/prd-console.md` 中定义的功能  
> **目标读者**：后端工程师、前端工程师、测试工程师  
> **设计原则**：OpenAI 兼容优先，Ultralisk 扩展次之。

---

## 1. 概述

### 1.1 API 基地址

```
SaaS 环境：    https://api.ultralisk.io/v1
私有化环境：   https://<customer-domain>/api/v1
```

### 1.2 认证方式

所有请求通过 `Authorization` Header 传递 API Key：

```http
Authorization: Bearer <API_KEY>
```

API Key 格式：`uk_<prefix>_<secret>`，其中 `uk_<prefix>` 部分用于日志和列表展示。

### 1.3 内容类型

```http
Content-Type: application/json
```

### 1.4 OpenAI 兼容性

以下端点与 OpenAI API 保持字段和行为一致：

- `POST /v1/chat/completions`
- `POST /v1/completions`
- `POST /v1/embeddings`
- `GET  /v1/models`

Ultralisk 专有端点使用 `/v1/ultralisk/*` 或 `/v1/*` 下的非 OpenAI 标准路径。

### 1.5 HTTP 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | 成功 | GET/POST 正常返回 |
| 201 | 已创建 | POST 创建资源成功 |
| 204 | 无内容 | DELETE 成功 |
| 400 | 请求参数错误 | 字段缺失、格式错误 |
| 401 | 未认证 | API Key 无效或缺失 |
| 403 | 无权限 | 角色不允许该操作 |
| 404 | 资源不存在 | 模型/端点/任务不存在 |
| 402 | 需要付款 | 余额不足 |
| 409 | 资源冲突 | 名称重复、状态不允许 |
| 422 | 语义错误 | 参数值非法 |
| 429 | 请求过于频繁 | 触发 rate limit |
| 500 | 服务器内部错误 | 服务端异常 |
| 503 | 服务暂不可用 | 模型过载或维护中 |

### 1.6 错误响应格式

```json
{
  "error": {
    "code": "insufficient_balance",
    "message": "Your account balance is insufficient for this request.",
    "param": null,
    "type": "request_error"
  }
}
```

通用错误码：

| error.code | 说明 |
|-----------|------|
| `invalid_api_key` | API Key 无效或已撤销 |
| `insufficient_balance` | 余额不足 |
| `rate_limit_exceeded` | 触发限流 |
| `model_not_found` | 模型不存在或不可用 |
| `invalid_request_error` | 请求参数错误 |
| `context_length_exceeded` | 超出最大上下文长度 |
| `endpoint_not_found` | 端点不存在 |
| `batch_job_failed` | 批量任务失败 |
| `internal_server_error` | 服务端内部错误 |

### 1.7 分页约定

List 端点统一使用 cursor-based 分页：

| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | integer | 每页数量，默认 20，最大 100 |
| `cursor` | string | 上一页返回的 `next_cursor` |

**Response 结构**

```json
{
  "object": "list",
  "data": [...],
  "has_more": true,
  "next_cursor": "c_abc123",
  "total_count": 256
}
```

---

## 2. 模型相关 API

### 2.1 获取模型列表

```http
GET /v1/models
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `deployment` | string | 否 | 过滤 Deployment 类型：`serverless` / `dedicated` / `batch` |
| `category` | string | 否 | 过滤类别：`chat` / `embedding` / `code` / `vision` |
| `features` | string | 否 | 逗号分隔：`json_mode` / `tool_calling` / `batch` |
| `q` | string | 否 | 按名称或作者搜索 |
| `playground` | boolean | 否 | 仅返回可在 Playground 使用的模型 |
| `deployable` | boolean | 否 | 仅返回可部署为 endpoint 的模型 |
| `batch` | boolean | 否 | 仅返回支持 batch 的模型 |

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "llama-3.1-8b-instruct",
      "object": "model",
      "created": 1719792000,
      "owned_by": "meta",
      "name": "Llama 3.1 8B Instruct",
      "category": "chat",
      "capabilities": ["chat", "json_mode"],
      "deployment_types": ["serverless", "dedicated", "batch"],
      "context_length": 128000,
      "pricing": {
        "serverless": {
          "input_per_1m_tokens": 0.15,
          "output_per_1m_tokens": 0.15
        },
        "batch": {
          "input_per_1m_tokens": 0.075,
          "output_per_1m_tokens": 0.075
        },
        "dedicated": {
          "gpu_type": "h100-80gb",
          "per_hour": 6.49
        }
      },
      "status": "available"
    }
  ]
}
```

### 2.2 获取模型详情

```http
GET /v1/models/:model_id
```

**Response 200**

```json
{
  "id": "llama-3.1-8b-instruct",
  "object": "model",
  "created": 1719792000,
  "owned_by": "meta",
  "name": "Llama 3.1 8B Instruct",
  "description": "Meta's instruction-tuned 8B parameter model.",
  "category": "chat",
  "capabilities": ["chat", "json_mode"],
  "context_length": 128000,
  "max_tokens": 4096,
  "limits": {
    "rpm": 1000,
    "concurrent_requests": 100
  },
  "pricing": { ... },
  "status": "available"
}
```

---

## 3. 推理 API（OpenAI 兼容）

### 3.1 Chat Completions

```http
POST /v1/chat/completions
```

**Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型 ID |
| `messages` | array | 是 | OpenAI 标准 messages 格式 |
| `stream` | boolean | 否 | 是否 SSE 流式，默认 false |
| `max_tokens` | integer | 否 | 最大生成 token 数 |
| `temperature` | float | 否 | 0-2，默认 1 |
| `top_p` | float | 否 | 0-1，默认 1 |
| `stop` | string/array | 否 | 停止序列 |
| `frequency_penalty` | float | 否 | -2 到 2 |
| `presence_penalty` | float | 否 | -2 到 2 |
| `response_format` | object | 否 | `{"type": "json_object"}` |
| `tools` | array | 否 | Phase 2 支持 |
| `tool_choice` | string/object | 否 | Phase 2 支持 |
| `seed` | integer | 否 | Phase 2 支持 |
| `safety_model` | string | 否 | Phase 3+ 评估，当前保留字段 |

**Response 200（非流式）**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1719792000,
  "model": "llama-3.1-8b-instruct",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 9,
    "total_tokens": 21
  }
}
```

**Response 200（流式）**

SSE 流，每行 `data: {...}`，结束标记 `data: [DONE]`。

### 3.2 Completions

```http
POST /v1/completions
```

**Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型 ID |
| `prompt` | string/array | 是 | 提示文本 |
| `stream` | boolean | 否 | 是否 SSE 流式 |
| `max_tokens` | integer | 否 | 最大生成 token 数 |
| `temperature` | float | 否 | 0-2 |
| `top_p` | float | 否 | 0-1 |
| `stop` | string/array | 否 | 停止序列 |
| `frequency_penalty` | float | 否 | -2 到 2 |
| `presence_penalty` | float | 否 | -2 到 2 |

**Response 200**

```json
{
  "id": "cmpl-abc123",
  "object": "text_completion",
  "created": 1719792000,
  "model": "llama-3.1-8b-instruct",
  "choices": [
    {
      "text": "Hello! How can I help you today?",
      "index": 0,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 9,
    "total_tokens": 14
  }
}
```

### 3.3 Embeddings

```http
POST /v1/embeddings
```

**Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `model` | string | 是 | embedding 模型 ID |
| `input` | string/array | 是 | 输入文本 |
| `encoding_format` | string | 否 | `float` / `base64` |

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023, -0.0091, ...]
    }
  ],
  "model": "bge-large-en-v1.5",
  "usage": {
    "prompt_tokens": 8,
    "total_tokens": 8
  }
}
```

---

## 4. API Keys 管理 API

> **角色值约定**：前端展示为 `Admin` / `Developer` / `Read-only`，API 传输值为 `admin` / `developer` / `read_only`。

### 4.1 列出 API Keys

```http
GET /v1/api-keys
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "key_abc123",
      "name": "Production Key",
      "prefix": "uk_prod***",
      "created_by": "user_xxx",
      "created_at": "2026-07-01T00:00:00Z",
      "last_used_at": "2026-07-10T06:00:00Z",
      "role": "developer",
      "status": "active",
      "allowed_models": null,
      "monthly_quota": 1000.00,
      "monthly_quota_used": 245.50
    }
  ]
}
```

### 4.2 创建 API Key

```http
POST /v1/api-keys
```

**Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | Key 名称 |
| `role` | string | 是 | `admin` / `developer` / `read_only` |
| `allowed_models` | array | 否 | 允许的模型 ID 列表，null 表示全部 |
| `monthly_quota` | number | 否 | 月度 USD 上限 |

**Response 201**

```json
{
  "id": "key_abc123",
  "name": "Production Key",
  "prefix": "uk_prod***",
  "key": "uk_prod***_xxxxxxxxxxxxxxxx",
  "created_at": "2026-07-10T06:00:00Z",
  "role": "developer",
  "status": "active",
  "allowed_models": null,
  "monthly_quota": 1000.00
}
```

> **注意**：完整 `key` 仅在创建时返回一次，后续接口不再暴露。

### 4.3 撤销 API Key

```http
POST /v1/api-keys/:key_id/revoke
```

**Response 200**

```json
{
  "id": "key_abc123",
  "status": "revoked",
  "revoked_at": "2026-07-10T06:00:00Z"
}
```

### 4.4 轮换 API Key

```http
POST /v1/api-keys/:key_id/rotate
```

**Response 201**

```json
{
  "id": "key_new123",
  "name": "Production Key",
  "prefix": "uk_prod***",
  "key": "uk_prod***_yyyyyyyyyyyyyyyy",
  "status": "active",
  "rotated_from": "key_abc123"
}
```

---

## 5. Endpoints 管理 API

### 5.0 获取 GPU 规格与定价

```http
GET /v1/gpu-types
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "h100-80gb",
      "name": "NVIDIA H100 80GB",
      "memory_gb": 80,
      "available_regions": ["us-east-1", "us-west-2"],
      "pricing": {
        "on_demand_per_hour": 6.49,
        "reserved_per_hour": 3.99
      }
    }
  ]
}
```

### 5.1 Endpoint 状态机

```
Creating ──► Active ──► Terminated
    │          │
    └────► Failed    ◄──（从 Active 也可能因异常进入 Failed）
```

- `Creating`：创建中，资源准备中
- `Active`：正常运行
- `Failed`：创建或运行失败
- `Terminated`：已删除/终止

### 5.2 列出 Endpoints

```http
GET /v1/endpoints
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "ep_abc123",
      "name": "llama-70b-prod",
      "model": "llama-3.3-70b-turbo",
      "type": "dedicated",
      "status": "active",
      "url": "https://api.ultralisk.io/v1/endpoints/ep_abc123",
      "created_at": "2026-07-01T00:00:00Z",
      "gpu_type": "h100-80gb",
      "replicas": {
        "min": 1,
        "max": 4,
        "current": 2
      },
      "metrics": {
        "qps": 45.2,
        "ttft_p95_ms": 180,
        "error_rate": 0.001,
        "gpu_utilization": 0.72
      }
    }
  ]
}
```

### 5.3 创建 Endpoint

```http
POST /v1/endpoints
```

**Request Body**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 端点名称 |
| `model` | string | 是 | 模型 ID |
| `type` | string | 是 | `serverless` / `reserved` / `dedicated` |
| `gpu_type` | string | 否 | Dedicated 必填，如 `h100-80gb` |
| `replicas` | object | 否 | `{min, max, target_utilization}` |

> **说明**：`url` 在 `status` 变为 `active` 后才可正常调用；`creating` 阶段返回 503。

**Response 201**

```json
{
  "id": "ep_abc123",
  "name": "llama-70b-prod",
  "model": "llama-3.3-70b-turbo",
  "type": "dedicated",
  "status": "creating",
  "url": "https://api.ultralisk.io/v1/endpoints/ep_abc123",
  "created_at": "2026-07-10T06:00:00Z"
}
```

### 5.4 获取 Endpoint 详情

```http
GET /v1/endpoints/:endpoint_id
```

### 5.5 更新 Endpoint

```http
PATCH /v1/endpoints/:endpoint_id
```

可更新字段：`name`、`replicas`。

### 5.6 删除 Endpoint

```http
DELETE /v1/endpoints/:endpoint_id
```

**Response 204**

---

## 6. Batch Jobs API

### 6.1 Batch Job 状态机

```
Pending ──► Running ──► Completed
    │     ▲   │
    │     │   └────► Failed
    └─────┘
          │
          ▼
      Cancelled
```

### 6.2 列出 Batch Jobs

```http
GET /v1/batch-jobs
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "batch_abc123",
      "name": "summer-campaign",
      "model": "llama-3.1-8b-instruct",
      "status": "completed",
      "submitted_at": "2026-07-01T00:00:00Z",
      "completed_at": "2026-07-01T06:00:00Z",
      "input_tokens": 1000000,
      "output_tokens": 500000,
      "cost": 75.00,
      "result_url": "https://storage.ultralisk.io/batch/batch_abc123/output.jsonl"
    }
  ]
}
```

### 6.3 创建 Batch Job

```http
POST /v1/batch-jobs
Content-Type: multipart/form-data
```

**Request Body（multipart/form-data）**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | `.jsonl` 输入文件 |
| `name` | string | 否 | 任务名称 |
| `model` | string | 是 | 模型 ID |
| `max_tokens` | integer | 否 | 默认 4096 |
| `temperature` | float | 否 | 默认 1 |
| `top_p` | float | 否 | 默认 1 |
| `response_format` | string | 否 | `json_object` |
| `callback_url` | string | 否 | 完成通知 webhook |

**输入文件格式**

```jsonl
{"custom_id": "task-001", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "llama-3.1-8b-instruct", "messages": [{"role": "user", "content": "Hello"}]}}
{"custom_id": "task-002", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "llama-3.1-8b-instruct", "messages": [{"role": "user", "content": "World"}]}}
```

**Response 201**

```json
{
  "id": "batch_abc123",
  "name": "summer-campaign",
  "model": "llama-3.1-8b-instruct",
  "status": "pending",
  "submitted_at": "2026-07-10T06:00:00Z",
  "cost_estimate": 75.00
}
```

### 6.4 获取 Batch Job 详情

```http
GET /v1/batch-jobs/:batch_id
```

**Response 200（Completed 状态）**

```json
{
  "id": "batch_abc123",
  "name": "summer-campaign",
  "model": "llama-3.1-8b-instruct",
  "status": "completed",
  "submitted_at": "2026-07-01T00:00:00Z",
  "completed_at": "2026-07-01T06:00:00Z",
  "input_tokens": 1000000,
  "output_tokens": 500000,
  "cost": 75.00,
  "result_url": "https://storage.ultralisk.io/batch/batch_abc123/output.jsonl",
  "errors": []
}
```

**Response 200（Failed 状态）**

```json
{
  "id": "batch_abc123",
  "status": "failed",
  "errors": [
    {
      "custom_id": "task-005",
      "line": 5,
      "code": "invalid_request_error",
      "message": "Invalid message format"
    }
  ]
}
```

### 6.5 取消 Batch Job

```http
POST /v1/batch-jobs/:batch_id/cancel
```

仅 `pending` 或 `running` 状态可取消。

---

## 7. 用量与账单 API

> **充值说明**：余额充值通过第三方支付页面（如 Stripe Checkout）完成，不通过此 API 直接扣款。充值完成后后台异步更新 `GET /v1/billing/balance`。

### 7.1 用量摘要

```http
GET /v1/usage/summary
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `range` | string | 否 | `today` / `7d` / `30d` / `custom` |
| `start` | string | 否 | ISO 日期，custom 必填 |
| `end` | string | 否 | ISO 日期，custom 必填 |

**Response 200**

```json
{
  "requests": 1200,
  "tokens": {
    "input": 250000,
    "output": 95000,
    "total": 345000
  },
  "cost": 12.50,
  "balance": 87.50,
  "range": "today"
}
```

### 7.2 最近 API 活动

```http
GET /v1/activity/recent
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `limit` | integer | 否 | 默认 10，最大 100 |
| `api_key_id` | string | 否 | 按 key 过滤 |

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "req_abc123",
      "time": "2026-07-10T06:23:00Z",
      "model": "llama-3.3-70b-turbo",
      "status_code": 200,
      "latency_ms": 450,
      "input_tokens": 120,
      "output_tokens": 85,
      "api_key_id": "key_xxx"
    }
  ]
}
```

### 7.3 账单余额

```http
GET /v1/billing/balance
```

**Response 200**

```json
{
  "balance": 87.50,
  "currency": "USD",
  "auto_recharge_enabled": false,
  "auto_recharge_threshold": 10.00,
  "auto_recharge_amount": 100.00
}
```

### 7.4 账单使用明细

```http
GET /v1/billing/usage
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `range` | string | 否 | `today` / `7d` / `30d` / `custom` |
| `group_by` | string | 否 | `model` / `day` / `api_key` |

**Response 200**

```json
{
  "range": "7d",
  "group_by": "model",
  "data": [
    {
      "key": "llama-3.3-70b-turbo",
      "requests": 5000,
      "input_tokens": 1000000,
      "output_tokens": 500000,
      "cost": 520.00
    }
  ]
}
```

### 7.5 账单列表

```http
GET /v1/billing/invoices
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "inv_abc123",
      "month": "2026-06",
      "amount": 1250.00,
      "status": "paid",
      "pdf_url": "https://...",
      "created_at": "2026-07-01T00:00:00Z"
    }
  ]
}
```

### 7.6 按 API Key 拆分费用

```http
GET /v1/billing/cost-by-api-key
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `range` | string | 否 | `today` / `7d` / `30d` / `custom` |

**Response 200**

```json
{
  "range": "30d",
  "data": [
    {
      "api_key_id": "key_abc123",
      "api_key_name": "Production Key",
      "requests": 5000,
      "input_tokens": 1000000,
      "output_tokens": 500000,
      "cost": 520.00
    }
  ]
}
```

---

## 8. Operations API（Phase 2）

### 8.1 集群列表

```http
GET /v1/clusters
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "cluster_abc123",
      "name": "us-east-1-prod",
      "region": "us-east-1",
      "gpu_type": "h100-80gb",
      "node_count": 8,
      "gpu_count": 64,
      "health": "healthy",
      "avg_gpu_utilization": 0.62
    }
  ]
}
```

### 8.2 节点列表

```http
GET /v1/nodes
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "node_abc123",
      "hostname": "gpu-node-01",
      "cluster_id": "cluster_abc123",
      "gpu_type": "h100-80gb",
      "gpu_count": 8,
      "memory_used_gb": 320,
      "memory_total_gb": 640,
      "temperature_c": 72,
      "driver_version": "550.54.15",
      "cuda_version": "12.4",
      "status": "online"
    }
  ]
}
```

### 8.3 GPU 利用率

```http
GET /v1/gpu-utilization
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `range` | string | 否 | `1h` / `6h` / `24h` / `7d` |
| `group_by` | string | 否 | `model` / `tenant` / `node` |

**Response 200**

```json
{
  "summary": {
    "total_gpus": 64,
    "avg_utilization": 0.62,
    "idle_gpus": 8,
    "queued_requests": 12
  },
  "timeseries": [
    {
      "timestamp": "2026-07-10T06:00:00Z",
      "value": 0.58
    }
  ]
}
```

### 8.4 成本归因

```http
GET /v1/cost-analytics
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `range` | string | 否 | `7d` / `30d` / `custom` |
| `group_by` | string | 是 | `model` / `endpoint` / `api_key` / `team` / `project` |

**Response 200**

```json
{
  "range": "30d",
  "group_by": "project",
  "data": [
    {
      "key": "project-alpha",
      "gpu_hours": 720,
      "token_cost": 3000.00,
      "gpu_hour_cost": 2160.00,
      "total_cost": 5160.00
    }
  ]
}
```

---

## 9. 审计日志 API（Phase 3）

### 9.1 列出审计日志

```http
GET /v1/audit-logs
```

**Query Parameters**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `range` | string | 否 | `7d` / `30d` / `custom` |
| `actor_id` | string | 否 | 按用户过滤 |
| `resource_type` | string | 否 | `api_key` / `endpoint` / `batch_job` / `model` |
| `action` | string | 否 | `create` / `update` / `delete` / `revoke` |

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "log_abc123",
      "timestamp": "2026-07-10T06:00:00Z",
      "actor": {
        "id": "user_xxx",
        "email": "admin@example.com"
      },
      "action": "create",
      "resource_type": "api_key",
      "resource_id": "key_abc123",
      "ip": "203.0.113.1",
      "user_agent": "Mozilla/5.0...",
      "details": {
        "name": "Production Key",
        "role": "developer"
      }
    }
  ]
}
```

---

## 10. Webhooks

### 10.1 签名验证

所有 Webhook 请求携带 `X-Ultralisk-Signature` Header，使用 HMAC-SHA256 对请求体签名：

```http
X-Ultralisk-Signature: t=1719792000,v1=sha256=<hex>
```

签名密钥在创建 Batch Job 或 Endpoint 时由后台生成，可通过 API 或 Console 查看/轮换。

### 10.2 Batch Job 完成通知

当 Batch Job 完成或失败时，向 `callback_url` 发送 POST 请求：

```json
{
  "event": "batch_job.completed",
  "data": {
    "id": "batch_abc123",
    "status": "completed",
    "completed_at": "2026-07-10T06:00:00Z",
    "result_url": "https://storage.ultralisk.io/batch/batch_abc123/output.jsonl"
  }
}
```

### 10.3 Endpoint 状态变更通知

```json
{
  "event": "endpoint.status_changed",
  "data": {
    "id": "ep_abc123",
    "previous_status": "creating",
    "status": "active"
  }
}
```

---

## 11. 限流与配额

### 11.1 组织级限流

| 层级 | 默认限制 | 说明 |
|------|---------|------|
| Organization RPM | 10,000 | 按组织汇总 |
| Organization TPM | 10,000,000 | 按组织汇总 |
| Concurrent requests | 1,000 | 按组织 |

### 11.2 API Key 级配额

通过 `monthly_quota` 设置月度 USD 上限。当 key 累计费用达到上限时：
- 返回 `402 Payment Required`
- `error.code = "quota_exceeded"`

### 11.3 限流响应头

```http
X-RateLimit-Limit: 10000
X-RateLimit-Remaining: 9999
X-RateLimit-Reset: 1719792060
```

---

## 12. 私有化环境差异

| 能力 | SaaS | 私有化 |
|------|------|--------|
| `/v1/billing/balance` | ✅ 真实余额 | 返回无限或本地计费模式标识 |
| `/v1/billing/invoices` | ✅ | ❌ 不返回 |
| `/v1/audit-logs` | Phase 3 可用 | Phase 1 即建议启用 |
| SSO/SAML | Phase 3 | Phase 1 即建议支持 |

---

## 13. 认证与用户 API（Phase 1）

> **说明**：以下端点用于 Console 用户登录和身份管理，与 API Key 认证不同。API Key 用于调用推理 API，用户 Session 用于访问 Console。

### 13.1 用户登录

```http
POST /v1/auth/login
```

**Request Body**

```json
{
  "email": "user@example.com",
  "password": "..."
}
```

**Response 200**

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 3600,
  "user": {
    "id": "user_xxx",
    "email": "user@example.com",
    "name": "Alex Chen",
    "org_role": "owner"
  }
}
```

### 13.2 获取当前用户

```http
GET /v1/me
```

### 13.3 获取组织成员

```http
GET /v1/organizations/:org_id/members
```

**Response 200**

```json
{
  "object": "list",
  "data": [
    {
      "id": "user_xxx",
      "email": "admin@example.com",
      "name": "Alex Chen",
      "org_role": "owner",
      "joined_at": "2026-07-01T00:00:00Z"
    }
  ]
}
```

### 13.4 邀请成员

```http
POST /v1/organizations/:org_id/invitations
```

**Request Body**

```json
{
  "email": "new@example.com",
  "org_role": "developer"
}
```

---

## 14. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-07-10 | 初始版本，覆盖 Phase 1-3 API 契约 |
| v0.2 | 2026-07-10 | 补充 `/v1/gpu-types`、`/v1/billing/cost-by-api-key`、认证 API、分页约定、Webhook 签名；修正 Batch 状态机；明确 Endpoint URL 可用性 |

---

*本文档与 `docs/prd-console.md` 配套使用，API 实现以本文档为准。*

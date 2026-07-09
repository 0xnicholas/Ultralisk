# Ultralisk 架构调研报告

> **报告日期**：2026-07-08
> **目的**：基于完整市场调研，为 Ultralisk 设计可行架构
> **团队背景**：已有 TokenCamp（类 OpenRouter 用户端网关，Rust），需要自建数据中心和 Provider 基础设施

---

## 摘要 (TL;DR)

**Ultralisk 是 TokenCamp 团队的内部 Provider 基础设施**——为 TokenCamp 这个 OpenRouter 类网关，提供自建的开源大模型推理服务。

完整定位：

```
用户
 ↓
TokenCamp (类 OpenRouter)        ← 已有项目 (Rust)
 - 用户管理、计费、路由
 - 多 Provider 调度
 ↓
Ultralisk (本项目，自建 Provider)  ← 要做的事
 - 自建数据中心
 - 部署开源模型
 - 优化 GPU 资源
 - 暴露 OpenAI 兼容 API 给 TokenCamp
 ↓
GPU + 液冷 + 网络 (硬件)
```

**核心结论**：
1. **Ultralisk = 自托管 Inference Provider**（不是 Gateway，不是优化工具）
2. **核心是 4 件事**：数据中心 + 开源模型部署 + GPU 优化 + Provider API
3. **最大竞争对手是"不自建"**——自建 vs 调 OpenAI/DeepSeek API
4. **自建的价值**：成本可控（规模化后）+ 数据合规 + 不被卡脖子
5. **第一步**：用 8-64 GPU 跑通 POC，对接 TokenCamp
6. **长期**：500-1000 GPU 规模，比 Together AI 更便宜地服务开源模型

---

## 一、TokenCamp 与 Ultralisk 的关系

### 1.1 团队已有产品：TokenCamp

从项目目录观察：

- **技术栈**：Rust + Axum
- **状态**：v0.9（2026-06-20）+ v0.12 Routing Module MVP（2026-07-01）
- **核心能力**：
  - OpenAI 兼容 API（`/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/images/generations`, `/v1/audio/*`）
  - Anthropic passthrough
  - 5 种路由策略（`simple_shuffle`, `lowest_cost`, `lowest_latency`, `usage_based`, `tag_based`）
  - 多 Provider 适配（OpenAI、Anthropic 等）
  - TPM/RPM 限流
  - Cost tracking
  - PII 脱敏（6 种）
  - AES-256-GCM 凭证加密
  - Prompt 压缩（LLMLingua-2）
  - Fusion（多模型融合：voting / deliberation / dag / single）
- **路线图 v1.0**：多租户网关、Control 运维总控台、Billing、自助注册、Cloud 部署

**TokenCamp = OpenRouter 类用户端网关**。它聚合多个 Provider，给用户一个统一入口。

### 1.2 Ultralisk 的角色：作为 TokenCamp 的一个 Provider

```
┌─────────────────────────────────────────────────────────┐
│  TokenCamp                                              │
│  - 终端用户 UI/API                                      │
│  - 用户管理、计费                                       │
│  - 多 Provider 路由（OpenAI / Anthropic / Ultralisk）  │
│  - 增值功能（压缩、融合、安全）                          │
└──────────────────────┬──────────────────────────────────┘
                       │ 调用
                       ↓
┌─────────────────────────────────────────────────────────┐
│  Ultralisk（本项目）                                     │
│  - 拥有 GPU（自建数据中心）                              │
│  - 部署开源模型（Llama / Qwen / DeepSeek）              │
│  - 暴露 OpenAI 兼容 API                                 │
│  - GPU 资源优化（类似 Chamber 思想）                    │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  其他 Provider（被 TokenCamp 调用）                       │
│  - OpenAI（GPT-4o）                                     │
│  - Anthropic（Claude）                                  │
│  - Together AI / Fireworks                              │
│  - 任何 OpenAI 兼容端点                                 │
└─────────────────────────────────────────────────────────┘
```

### 1.3 TokenCamp 已知 Provider 协议（推断）

从 TokenCamp 代码结构推断（基于 `gateway/`、`routing/`、`credentials` 加密、Provider Key 静态加密）：

```rust
// 推断的 Provider trait（基于 TokenCamp v0.5 加密 + v0.4 路由）
trait Provider {
    async fn chat(&self, req: ChatRequest) -> Result<ChatResponse>;
    async fn stream(&self, req: ChatRequest) -> Result<Stream<Chunk>>;
    async fn list_models(&self) -> Result<Vec<ModelInfo>>;
    fn auth(&self) -> &ProviderKey;  // 加密存储
    fn cost_per_token(&self, model: &str) -> Cost;
}
```

**Ultralisk 只需实现这个 Provider trait**——TokenCamp 不需要知道 Ultralisk 的内部实现。

### 1.4 Ultralisk 与 TokenCamp 的边界

| 关注点 | TokenCamp | Ultralisk |
|--------|-----------|-----------|
| **用户管理** | ✅ | ❌ |
| **用户计费** | ✅ | ❌ |
| **多 Provider 路由** | ✅ | ❌ |
| **限流（用户级）** | ✅ | ❌ |
| **PII 脱敏** | ✅（已实现） | ❌（不需要） |
| **凭证加密** | ✅ | ⚠️（自用即可） |
| **Prompt 压缩** | ✅（已实现） | ❌（不需要） |
| **Fusion 多模型融合** | ✅ | ❌（单 Provider） |
| **OpenAI 兼容 API（提供方）** | 上游调用 | ✅ **暴露** |
| **实际推理（GPU）** | ❌ | ✅ |
| **GPU 优化** | ❌ | ✅ |
| **数据中心** | ❌ | ✅ |
| **多租户（基础设施层）** | ❌ | ⚠️（按内部团队分账） |
| **硬件** | ❌ | ✅ |

**关键**：TokenCamp 已经做了用户级的事情（计费、限流、PII、压缩），Ultralisk 只需要专注**做最好的 Provider**。

---

## 二、Ultralisk 的真正定位

### 2.1 核心定义

> **Ultralisk 是 TokenCamp 团队自建的自托管 Inference Provider**，通过自建数据中心 + 部署开源模型 + GPU 优化，为 TokenCamp 提供一个成本可控、数据合规、不被外部卡脖子的 Provider 端点。

### 2.2 为什么团队要自建 Provider？

| 原因 | 详细 |
|------|------|
| **成本** | 规模化后，自建 GPU 比 Together AI / Fireworks 便宜 30-50% |
| **数据合规** | TokenCamp 用户的数据可以走自建（不依赖第三方） |
| **不被卡脖子** | 不依赖 OpenAI/Anthropic 的 API 可用性、配额、价格 |
| **差异化** | TokenCamp 比 OpenRouter 多一个"自营 Provider"——开源模型直接服务 |
| **能力沉淀** | 团队积累 AI Infra、GPU 优化、推理引擎经验 |
| **主权 AI** | 未来可服务对数据出境敏感的客户 |

### 2.3 自建 Provider 不是什么

- ❌ **不是 To-C 的产品**——TokenCamp 是用户端，Ultralisk 是基础设施
- ❌ **不是 OpenAI 的替代品**——TokenCamp 已经有 OpenAI/Anthropic Provider
- ❌ **不是卖给第三方的软件**——目前是 TokenCamp 内部用
- ❌ **不是通用 MLOps 平台**——专注推理服务

### 2.4 Ultralisk 的 4 大核心目标

```
┌────────────────────────────────────────────────────┐
│  1. 自建数据中心 (CapEx 投入)                       │
│     - GPU 服务器 (H100/B200)                       │
│     - 网络、存储、液冷                              │
│     - 选址、电力、合规                              │
├────────────────────────────────────────────────────┤
│  2. 部署开源模型 (推理服务)                         │
│     - vLLM/SGLang 推理引擎                        │
│     - 多模型支持（Llama / Qwen / DeepSeek）       │
│     - 高性能优化（量化、批处理）                    │
├────────────────────────────────────────────────────┤
│  3. GPU 资源优化 (Chamber 思想)                     │
│     - GPU 利用率提升                                │
│     - 智能调度                                      │
│     - 成本监控                                      │
├────────────────────────────────────────────────────┤
│  4. Provider API (对接 TokenCamp)                   │
│     - OpenAI 兼容接口                              │
│     - 标准 Provider 协议                           │
│     - 监控、用量、成本归因                          │
└────────────────────────────────────────────────────┘
```

---

## 三、完整技术架构

### 3.1 4 层架构图

```
┌─────────────────────────────────────────────────────┐
│  用户终端应用                                        │
└──────────────────────┬──────────────────────────────┘
                       ↓ HTTPS
┌─────────────────────────────────────────────────────┐
│  TokenCamp（已有）                                  │
│  - 用户管理、计费、限流、压缩、融合                │
│  - 多 Provider 路由                                │
└──────────────────────┬──────────────────────────────┘
                       │ 调用（OpenAI 兼容协议）
                       ↓
┌─────────────────────────────────────────────────────┐
│  Ultralisk 对外接口层（Provider API）                │
│  ┌──────────────────────────────────────────────┐  │
│  │ API 网关 (Kong / Envoy)                     │  │
│  │ - 鉴权（服务密钥，验证 TokenCamp 身份）      │  │
│  │ - 限流（TPM/RPM per Provider 密钥）         │  │
│  │ - 监控埋点 (Prometheus + OTel)              │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ Provider 业务层（FastAPI / Rust Axum）       │  │
│  │ - OpenAI 兼容适配（/v1/chat/completions 等） │  │
│  │ - 模型路由（按 model name 分发）            │  │
│  │ - Token 计量（精确计数）                     │  │
│  │ - 流式响应 (SSE)                             │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  推理服务层（核心）                                   │
│  ┌──────────────────────────────────────────────┐  │
│  │ 推理引擎抽象层                                │  │
│  │ - 后端：vLLM（主）/ SGLang（备）/ TGI        │  │
│  │ - 模型注册中心（动态加载/卸载）              │  │
│  │ - 量化（AWQ / GPTQ）                        │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 部署框架（KServe + llm-d）                   │  │
│  │ - LLMInferenceService CRD                   │  │
│  │ - KV-cache 感知路由                         │  │
│  │ - Prefill-Decode 分离                       │  │
│  │ - 自动扩缩容 (HPA)                          │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 内容安全（可选）                              │  │
│  │ - Llama Guard 3 审核                         │  │
│  │ - PII 检测（兜底，TokenCamp 已有可跳过）    │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  基础设施层（GPU 优化 = Chamber 思想）                │
│  ┌──────────────────────────────────────────────┐  │
│  │ GPU 调度（Volcano / KAI Scheduler）          │  │
│  │ - 多模型 GPU 分配                            │  │
│  │ - 优先级队列                                 │  │
│  │ - 弹性伸缩                                   │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ AIOps 优化（自建，Chamber 思想）             │  │
│  │ - GPU 利用率实时监控（DCGM）                 │  │
│  │ - 工作负载预测                               │  │
│  │ - 智能体调度（Claude API 驱动）              │  │
│  │ - 故障自愈（节点故障自动迁移）               │  │
│  │ - 成本归因（每模型的 $/M tokens）           │  │
│  └──────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────┐  │
│  │ 监控告警                                     │  │
│  │ - Prometheus + Grafana                      │  │
│  │ - Loki（日志）                                │  │
│  │ - OpenTelemetry（tracing）                    │  │
│  │ - Langfuse（LLM 监控）                       │  │
│  └──────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────┐
│  物理基础设施层                                       │
│  - GPU 集群（H100 / B200，100-1000 张）             │
│  - InfiniBand / RoCE 网络（节点互联）               │
│  - 液冷（Vertiv / GRC）                              │
│  - 并行文件系统（WekaFS / Lustre）                   │
│  - DCIM + 电力监控                                  │
│  - 模型仓库（HuggingFace / 自建 mirror）             │
└─────────────────────────────────────────────────────┘
```

### 3.2 关键模块详解

#### 模块 1：Provider API 层

**目标**：让 TokenCamp 像调用 OpenAI 一样调用 Ultralisk

**核心端点**（OpenAI 兼容）：

| 端点 | 用途 |
|------|------|
| `POST /v1/chat/completions` | 聊天补全（含流式 SSE） |
| `POST /v1/completions` | 文本补全 |
| `POST /v1/embeddings` | Embedding |
| `GET /v1/models` | 列出可用模型 |
| `GET /health` | 健康检查 |
| `GET /metrics` | Prometheus 指标 |

**鉴权**：

```
TokenCamp 持有 Ultralisk 颁发的服务密钥
↓
请求带: Authorization: Bearer ultralisk-prod-xxx
↓
Ultralisk 验证 + 关联到 TokenCamp 租户
```

**Token 计量**：

```python
# 关键：精确计算 token 数（按模型 token 化）
{
  "prompt_tokens": 1234,    # 输入 tokens
  "completion_tokens": 567, # 输出 tokens
  "total_tokens": 1801
}
```

#### 模块 2：推理服务层

**目标**：高性能、低延迟运行开源模型

**推理引擎选型**：

| 引擎 | 何时用 | 占比 |
|------|--------|------|
| **vLLM** | 90% 场景（首选） | 主 |
| **SGLang** | 结构化生成、低延迟 | 备 |
| **TGI** | HF 生态内特定需求 | 偶尔 |

**多模型管理**：

```
模型注册表（MLflow Registry 或自建）
├── llama-3.1-70b-instruct (FP16, 140GB)
├── llama-3.1-8b-instruct (INT4, 4GB)
├── qwen-2.5-72b-instruct (FP16, 145GB)
├── deepseek-v3 (FP16, 685GB)
└── bge-large-en-v1.5 (embedding, 1.3GB)

GPU 容量：1000 × H100 80GB = 80TB 显存
├─ 大模型 (70B+) 占用整个 node
├─ 中模型 (8B-30B) 可多个共享
└─ 小模型 (embedding) 高密度共享
```

**量化策略**：

| 模型大小 | 量化 | GPU 占用 | 用途 |
|---------|------|---------|------|
| 70B+ | FP16 | 140GB+ | 主力 |
| 70B+ | INT4 (AWQ) | 35GB | 成本敏感 |
| 8B-30B | FP16 | 16-60GB | 中等场景 |
| 8B | INT4 | 4GB | 高密度 |

#### 模块 3：基础设施层（AIOps 优化）

**目标**：让 GPU 跑满，让成本可控

**借鉴 Chamber 思想，但不是再造 Chamber**：

| 能力 | 说明 | 优先级 |
|------|------|--------|
| **GPU 利用率监控** | DCGM exporter → Prometheus | P0 |
| **多模型 GPU 调度** | Volcano / KAI | P0 |
| **自动扩缩容** | K8s HPA + 自定义指标 | P0 |
| **工作负载预测** | 时序预测，决定预留容量 | P1 |
| **故障检测** | 心跳、训练卡死检测 | P1 |
| **自动迁移** | 节点故障时迁移工作负载 | P1 |
| **成本归因** | 每模型、每团队的 $/M tokens | P1 |
| **智能体调度（Slack）** | Chamber 式 ChatOps | P2（差异化） |
| **跨云/多集群联邦** | 未来扩展 | P2 |

**关键洞察**：Ultralisk 的 AIOps 是**自用工具，不是产品**——优化目标单一（让 GPU 跑满），不需要通用化。

#### 模块 4：物理基础设施

**目标**：自建一个 GPU 集群

**关键决策**（详见第四章）：
- 选址（电力 + 网络 + 合规）
- 规模（首批 64-256 GPU，长期 500-1000）
- 硬件（H100 vs B200，InfiniBand vs RoCE）
- 冷却（液冷必备）
- 存储（WekaFS 是商业首选，Lustre 开源）

---

## 四、关键决策分析

### 4.1 决策 1：自建 vs 用 Together AI / Fireworks

| 维度 | 自建 Ultralisk | Together AI / Fireworks |
|------|--------------|------------------------|
| **短期成本** | 高（CapEx $30-50M） | 低（按 token） |
| **长期成本（>2 年）** | **低 30-50%** | 中 |
| **数据合规** | **完全可控** | 数据出境 |
| **可控性** | **完全可控** | 依赖外部 |
| **被卡脖子风险** | **无** | 高（API 限流、价格变动） |
| **上线速度** | 慢（3-6 个月） | 快（1 周） |
| **运维负担** | 高 | 零 |
| **能力沉淀** | **有** | 无 |

**建议**：
- **短期（0-6 月）**：可以先用 Together AI 跑通 TokenCamp 集成
- **中期（6-12 月）**：自建 POC（64-128 GPU）
- **长期（>12 月）**：自建主用，Together AI 兜底

### 4.2 决策 2：第一个模型选什么

| 候选 | 优势 | 劣势 |
|------|------|------|
| **Llama 3.1 70B** | 生态最成熟，工具链完善 | Meta 政治风险 |
| **Qwen 2.5 72B** | 中文最强，性能接近 Llama | 国际市场接受度 |
| **DeepSeek V3** | 开源 SOTA，价格极低 | 较新，社区小 |
| **Llama 3.1 8B** | 小、快、可高密度 | 能力弱 |

**建议**：
- **第一个模型：Llama 3.1 70B**（生态成熟、风险可控）
- **第二个模型：Qwen 2.5 72B**（中文场景）
- **第三个模型：DeepSeek V3**（极致性价比）

### 4.3 决策 3：推理引擎

**强烈推荐 vLLM** 作为主力：
- ✅ 吞吐最高（PagedAttention）
- ✅ 生态最成熟
- ✅ KServe 集成完善
- ✅ 生产案例最多

SGLang 作为备选（结构化生成场景）。

### 4.4 决策 4：部署框架

**推荐 KServe + llm-d**：
- ✅ K8s 原生
- ✅ LLMInferenceService CRD 专门为 LLM 设计
- ✅ 支持 KV-cache 路由、Prefill-Decode 分离
- ✅ 2026 v0.17 已生产就绪

### 4.5 决策 5：编程语言

**选项对比**：

| 语言 | 优势 | 劣势 |
|------|------|------|
| **Python** | 推理引擎生态全（vLLM/SGLang） | 性能差 |
| **Rust** | 性能高，TokenCamp 风格统一 | 推理引擎集成弱 |
| **混合** | 网关 Rust + 推理 Python | 复杂度高 |

**建议**：
- **核心推理**：Python（vLLM/SGLang 强依赖）
- **Provider API 网关**：可选 Rust（与 TokenCamp 一致）或 Python（快速开发）
- **优先 Python**——减少与推理引擎的阻抗失配

### 4.6 决策 6：内容安全

**TokenCamp 已有 PII 脱敏**（6 种）。所以：
- **TokenCamp 侧**：已做
- **Ultralisk 侧**：**可不做**（除非未来要服务外部客户）

建议 **第一版不做内容安全**，让 TokenCamp 处理。如果未来需要，集成 Llama Guard 3。

---

## 五、商业可行性分析

### 5.1 成本结构（1000 GPU 规模）

| 类别 | 一次性 (CapEx) | 年度 (OpEx) |
|------|--------------|-----------|
| GPU 服务器 (1000 × H100) | $30M | - |
| 网络 (InfiniBand) | $3M | - |
| 存储 (WekaFS) | $2M | - |
| 液冷系统 | $5M | - |
| 数据中心建设 (电力 + 制冷) | $10M | - |
| 软件 (Ultralisk + KServe + 监控) | $0.5M | $2-5M |
| 电力 | - | $3-5M |
| 运维人工 (3-5 人) | - | $1-3M |
| **合计** | **$50.5M** | **$6-13M/年** |

### 5.2 收入模型（自建 vs 外部）

**核心逻辑**：自建不是为了直接卖，是为 TokenCamp 提供成本可控的 Provider 端点。

**对比示例**（Llama 3 70B，按 1M tokens 计）：

| 方案 | 输入价格 | 输出价格 | 100M tokens/月成本 |
|------|---------|---------|------------------|
| **Together AI** | $0.88 | $0.88 | $176K |
| **Fireworks AI** | $0.90 | $0.90 | $180K |
| **Ultralisk 自建** | $0.30-0.50 | $0.30-0.50 | $60-100K |
| **节省** | - | - | **$80-120K/月** |

按 60% 利用率、2 年回本：
- 月节省 $100K × 12 × 2 = $2.4M
- CapEx $50M
- **回本周期：~20 年**（不含其他价值）

**仅算直接成本，自建难以回本**——但价值不在成本：

- **数据合规价值**：无法用钱衡量
- **能力沉淀价值**：无法用钱衡量
- **战略价值**：不被卡脖子

**真实决策逻辑**：不是为了省钱，是为了**自主可控**。

### 5.3 自建的真实价值

| 价值 | 量化估算 |
|------|---------|
| **数据合规溢价** | 企业愿意为数据不出境付 30-50% 溢价 |
| **不被卡脖子** | 价值无法量化，但很重要 |
| **主权 AI 能力** | 未来可服务政企客户 |
| **技术能力** | 团队 AI Infra 经验积累 |
| **成本节约** | 规模化后 30-50% 成本优势 |

---

## 六、实施路线图

### Phase 1: POC（0-3 个月）

**目标**：用 8-64 GPU 跑通一个模型，对接 TokenCamp

| 步骤 | 内容 | 时间 |
|------|------|------|
| 1.1 | 租 8 张 H100（云上，AWS/Lambda/RunPod） | 1 周 |
| 1.2 | 部署 vLLM，跑 Llama 3 70B | 1 周 |
| 1.3 | 写 Provider API（FastAPI，OpenAI 兼容） | 2 周 |
| 1.4 | 集成到 TokenCamp | 1 周 |
| 1.5 | 端到端测试 + 性能基线 | 1 周 |

**产出**：TokenCamp 用户能通过 Ultralisk 调用 Llama 3

**预算**：$10-30K（云 GPU 租赁）

### Phase 2: 自建小集群（3-9 个月）

**目标**：自建 64-128 GPU 集群，生产可用

| 步骤 | 内容 | 时间 |
|------|------|------|
| 2.1 | 数据中心选址 + 谈判 | 2 个月 |
| 2.2 | 硬件采购（GPU + 网络 + 存储 + 液冷） | 2 个月 |
| 2.3 | 部署 K8s + KServe + 监控 | 1 个月 |
| 2.4 | vLLM 优化（量化、批处理） | 1 个月 |
| 2.5 | 多模型支持（Llama + Qwen） | 1 个月 |
| 2.6 | TokenCamp 完整集成 + SLA | 1 个月 |

**产出**：自建集群生产服务 TokenCamp 10% 流量

**预算**：$5-15M（硬件）+ $1-2M/年（运维）

### Phase 3: 规模 + 优化（9-18 个月）

**目标**：500 GPU 规模，GPU 利用率 60%+

| 步骤 | 内容 |
|------|------|
| 3.1 | 扩展到 500 GPU |
| 3.2 | AIOps 优化（Chamber 思想） |
| 3.3 | 成本归因系统 |
| 3.4 | 自动扩缩容 |
| 3.5 | 故障自愈 |
| 3.6 | 多模型动态加载 |

**产出**：自建服务 50% 流量，GPU 利用率 60%+

**预算**：$20-30M（硬件增量）+ $3-5M/年（运维）

### Phase 4: 完全自营（18+ 个月）

**目标**：1000 GPU 规模，成本最优

| 步骤 | 内容 |
|------|------|
| 4.1 | 1000 GPU 规模 |
| 4.2 | 极致优化（自研推理引擎可选） |
| 4.3 | 多区域部署 |
| 4.4 | 服务外部客户（可选） |

**产出**：自建服务 100% 开源模型流量

**预算**：$50M+（总硬件）+ $10M+/年（运维）

---

## 七、关键风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| **自建成本超预算** | 高 | Phase 1 用云租赁验证，验证后再自建 |
| **推理性能不如 Together AI** | 中 | vLLM 已是 SOTA，差距在工程优化 |
| **GPU 供应紧张** | 中 | 提前 6 个月下订单，多供应商备份 |
| **数据中心选址失败** | 高 | 候选多个地点，电力优先 |
| **电力供应不足** | 高 | 与电力公司早期谈判 |
| **运维人才稀缺** | 高 | 外包部分运维，培养核心团队 |
| **NVIDIA 工具替代** | 中 | 紧跟 NVIDIA 生态，但不依赖单一 |
| **TokenCamp 协议变更** | 低 | OpenAI 兼容是行业标准 |

---

## 八、与其他 Provider 玩家对比

### 8.1 Ultralisk 的独特定位

```
┌────────────────────────────────────────────┐
│  公有云 Provider (直接对标)                  │
│  - Together AI, Fireworks AI, Groq        │
│  - 数据出境，标准化                        │
│  → 竞争：Ultralisk 用"私有化"差异化       │
├────────────────────────────────────────────┤
│  Neocloud (卖 GPU 算力)                     │
│  - CoreWeave, Lambda, RunPod              │
│  - 偏 IaaS，自用推理需自建                │
│  → 竞争：Ultralisk 提供完整 PaaS          │
├────────────────────────────────────────────┤
│  ⭐ 自托管 Provider (Ultralisk 目标)        │
│  - 当前几乎没有成熟产品                   │
│  - 客户：金融、电信、政务、医院            │
│  - 数据合规要求严格                       │
│  → 空白市场！                            │
├────────────────────────────────────────────┤
│  自建拼凑方案 (vLLM + LiteLLM + KServe)   │
│  - 客户自己做                             │
│  - 需要 3-6 个月和 5-10 人                │
│  → 竞争：Ultralisk 是产品化方案           │
└────────────────────────────────────────────┘
```

### 8.2 Ultralisk 的核心竞争优势

1. **与 TokenCamp 深度集成**——不是通用 Provider，是配套基础设施
2. **专注开源模型**——不和 Together AI 全面竞争，专注细分
3. **数据合规优先**——可服务对数据敏感的客户
4. **能力沉淀**——团队积累 AI Infra 经验
5. **优化可见**——GPU 利用率、成本可监控可优化

---

## 九、关键洞察总结

1. **Ultralisk 是 TokenCamp 的内部 Provider**，不是独立产品
2. **核心是 4 件事**：数据中心 + 开源模型 + GPU 优化 + Provider API
3. **价值在自主可控**，不在直接 ROI
4. **第一步用云租赁验证**（8-64 GPU），再自建
5. **vLLM + KServe 是技术选型基线**
6. **Llama 3 70B 作为第一个模型**
7. **Python 是主语言**（与推理引擎生态匹配）
8. **TokenCamp 已有 PII/压缩/限流**，Ultralisk 不重复做
9. **AIOps 是差异化但不是核心**，先做基础 Provider
10. **回本周期长是正常的**——这不是财务投资，是战略投资

---

## 十、立即可做的事

### 10.1 本周

1. 团队讨论，达成共识
2. 看 TokenCamp 现有 Provider 实现细节
3. 启动 Phase 1 POC 准备

### 10.2 本月

1. 租 8 张 H100（云上）
2. 部署 vLLM
3. 写最小 Provider API（FastAPI，OpenAI 兼容）
4. 集成 TokenCamp

### 10.3 本季度

1. 完成 Phase 1 POC
2. 评估自建可行性
3. 启动数据中心选址

---

## 附录 A：技术选型一览

| 层级 | 组件 | 选型 | 备选 |
|------|------|------|------|
| 推理引擎 | vLLM | ✅ 主力 | SGLang, TGI |
| 部署框架 | KServe + llm-d | ✅ | 自建 K8s |
| 容器编排 | Kubernetes | ✅ | - |
| API 网关 | Kong / Envoy | ✅ | Traefik, Nginx |
| Provider API | FastAPI (Python) | ✅ 快速 | Rust Axum |
| 监控 | Prometheus + Grafana | ✅ | Datadog |
| 追踪 | OpenTelemetry | ✅ | - |
| LLM 监控 | Langfuse | ✅ | Arize Phoenix |
| GPU 监控 | DCGM Exporter | ✅ | - |
| 调度 | Volcano / KAI | ✅ | 自建 |
| GitOps | ArgoCD | ✅ | Flux |
| 凭证 | Vault | ✅ | K8s Secrets |
| 内容安全 | Llama Guard 3 | ⚠️ 可选 | 规则引擎 |
| 量化 | AWQ / GPTQ | ✅ | bitsandbytes |
| 网络 | InfiniBand | ✅ | RoCE (Spectrum-X) |
| 存储 | WekaFS | ✅ 商业 | Lustre (开源) |
| 液冷 | Vertiv | ✅ | GRC, Submer |

---

## 附录 B：参考数据来源

### TokenCamp
- 仓库位置：`../tokencamp`
- 技术栈：Rust + Axum
- 状态：v0.9 (2026-06-20) + v0.12 Routing Module MVP (2026-07-01)
- 路线图：v1.0 SaaS launch planned

### 推理引擎
- [vLLM vs SGLang 2026 - TURION](https://turion.ai/blog/vllm-vs-sglang-inference-comparison-2026/)
- [vLLM Throughput Benchmark - Markaicode](https://markaicode.com/benchmarks/tool-scalability-benchmark/)
- [LLM Serving Frameworks 2026 - SWFTE](https://www.swfte.com/blog/llm-serving-frameworks-2026-comparison)
- [KServe v0.17 Release](https://kserve.github.io/website/blog/kserve-0.17-release)
- [Production-Grade LLM Inference with KServe + llm-d + vLLM](https://kserve.github.io/website/blog/kserve-0.17-release)

### 部署平台
- [Replicate vs Modal 2026](https://www.morphllm.com/comparisons/replicate-vs-modal)
- [Inference Platform Economics](https://ai-engineering.academy/learn/17-infrastructure-and-production/02-inference-platform-economics/)

### Provider 协议
- [OpenRouter: Provider Routing & Architecture](https://openrouter.ai/docs/guides/routing/provider-selection)
- [Fireworks AI: Inference Providers vs API Routers](https://fireworks.ai/blog/inference-providers-vs-api-routers)
- [LiteLLM: Multi-Tenant Architecture](https://docs.litellm.ai/docs/proxy/multi_tenant_architecture)
- [The Inference Gateway Pattern](https://tianpan.co/blog/2026-04-13-inference-gateway-pattern)

### GPU 优化
- [Chamber - usechamber.io](https://usechamber.io/)
- [Zymtrace vs Nsight](https://zymtrace.com/article/zymtrace-nsight/)
- [XPerf - AI Native Cluster Operations](https://xperf.ai/)

### 成本
- [LLM API Pricing Comparison 2026 - inference.net](https://inference.net)
- [AI Inference Cost Economics 2026 - Spheron](https://spheron.network)
- [Self-Hosted LLMs in 2026 - Empirium](https://empirium.io/blog/self-hosted-llm-2026)

---

## 附录 C：术语表

| 术语 | 解释 |
|------|------|
| **Provider** | AI 推理服务提供方，拥有 GPU 并直接服务用户（区别于 Gateway） |
| **Gateway** | 路由层，聚合多个 Provider，不拥有 GPU（OpenRouter, LiteLLM） |
| **TokenCamp** | 团队已有的 OpenRouter 类用户端网关项目 |
| **Ultralisk** | 本项目，TokenCamp 的自建 Provider 基础设施 |
| **POC** | Proof of Concept，概念验证 |
| **CRD** | Custom Resource Definition，K8s 自定义资源 |
| **PagedAttention** | vLLM 核心 KV cache 管理技术 |
| **Prefill-Decode 分离** | 把 LLM 推理拆成两阶段独立调度 |
| **KV cache** | LLM 推理中缓存的 Key-Value 注意力数据 |
| **Neocloud** | 新一代专门 AI 的 GPU 云服务商 |
| **AWQ/GPTQ** | 模型量化算法，INT4 压缩 |
| **Llama Guard** | Meta 开源的内容安全模型 |
| **DCGM** | NVIDIA Data Center GPU Manager |
| **LLMInferenceService** | KServe 提供的 LLM 专用 CRD |
| **llm-d** | K8s 上 LLM 分布式推理框架 |
| **OpenAI 兼容** | 遵循 OpenAI API 规范的接口 |
| **SSE** | Server-Sent Events，流式响应协议 |
| **TPM/RPM** | Tokens/Minute, Requests/Minute，限流单位 |
| **KAI Scheduler** | NVIDIA 开源的 K8s 调度器（前 Run:ai） |

---

*报告完*
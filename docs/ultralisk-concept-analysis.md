# Ultralisk 项目概念分析

> **版本**：v0.3（2026-07-09）
> **来源**：对标 together.ai，参考 usechamber.io

---

## 一、做什么

做一个 AI 推理云平台。核心能力：跑开源大模型，对外提供 OpenAI 兼容 API，按量收费。

---

## 二、对标谁

**主要对标：together.ai**

Together AI 做的事情就是 Ultralisk 要做的事情。研究它的产品矩阵、技术栈、定价、客户——然后照着做。

**参考对象：usechamber.io**

Chamber 做了推理云通常不做的事：GPU 利用率可见、故障诊断、成本归因。Ultralisk 的云产品应该把这些能力做进去——不是另开产品线，是云的一部分。

---

## 三、Together AI 概览

### 3.1 公司数据

| 维度 | 数据 |
|------|------|
| 成立 | 2022 年 |
| 定位 | 全栈 AI 推理云（公有云 SaaS） |
| 估值 | $8.3B（2026.7，Series C $800M） |
| 年化收入 | $1B |
| 模型数量 | 200+ |
| GPU 容量 | 2GW+ 全球电力，25+ 城市 |
| 团队 | 200-300 人 |

### 3.2 产品矩阵

```
Serverless Inference（按 token，50+ 模型，零配置）
  → Batch Inference（50% 折扣，30B tokens/模型）
    → Provisioned Throughput（$0.05/min，99% SLA）
      → Dedicated Endpoints（独享 GPU，$6.49/hr H100）
        → GPU Clusters（自服务集群，$2.99/hr 起）

配套产品：
  Fine-Tuning（LoRA + 全参微调）
  Code Sandbox（开发环境）
  Managed Storage（对象存储 + 并行 FS）
```

### 3.3 技术栈

- **推理引擎**：自研 TIE 2.0（宣称 4x vs 开源 vLLM）
- **CUDA Kernel**：FlashAttention-4（71% 利用率 on B200）、ThunderKittens DSL
- **推理优化**：Speculative Decoding（ATLAS/Sequoia/Medusa/SpecExec）、Prefill-Decode 分离（CPD）
- **量化**：QTIP、TEAL、FP8
- **开源贡献**：FlashAttention 系列、RedPajama-v2 数据集、KAI Scheduler

### 3.4 定价示例

| 模型 | 输入 /1M tokens | 输出 /1M tokens |
|------|----------------|----------------|
| DeepSeek V4 Pro | $1.74 | $3.48 |
| Llama 3.3 70B Turbo (FP8) | $1.04 | $1.04 |
| Llama 3.1 8B | ~$0.15 | ~$0.15 |
| Qwen 2.5 72B | ~$0.90 | ~$0.90 |

---

## 四、Chamber 参考什么

### 4.1 Chamber 概览

| 维度 | 数据 |
|------|------|
| 定位 | GPU 基础设施 AIOps |
| 融资 | $2.5M Seed（YC W26） |
| 定价 | 免费版 ≤32 GPU；Pro $0.15/GPU/天 |
| 核心能力 | Chambie 智能体（故障诊断、利用率优化、自动恢复） |

### 4.2 对 Ultralisk 有用的

Chamber 做得好、但 Together AI 没做好、Ultralisk 云产品应该做的：

- **GPU 利用率可见**——客户能看到推理消耗了多少 GPU 资源
- **成本归因**——按模型、按 API Key 拆分费用
- **故障可见**——模型挂了、延迟异常、用户侧可以看到并且告警
- **免费 Dashboard**——Chamber 的获客策略值得参考（先用免费工具看到价值）

这些不是独立产品，是云产品的**内置功能**。

---

## 五、Ultralisk 的产品形态

```
Ultralisk Cloud（一个产品）

├── 推理服务
│   ├── Serverless（按 token）
│   ├── Batch（折扣）
│   └── 预留容量（包月/包年）
│
├── 模型
│   └── 精选开源模型（10+ 起步）
│
├── API
│   └── OpenAI 兼容
│
├── 控制台
│   ├── API Key 管理
│   ├── Token 消耗 & 费用
│   ├── 模型性能（QPS / 延迟 / 错误率）
│   └── GPU 利用率（参考 Chamber）
│
└── 未来可选
    └── 私有化部署（客户自持 GPU，运行同一套软件）
```

---

## 六、技术方案

### 6.1 核心选型

| 组件 | 选型 | 为什么 |
|------|------|--------|
| 推理引擎 | vLLM | Together AI 自研，但开源 vLLM 对早期够用 |
| 量化 | AWQ INT4 | 成熟开源，显存省 4x |
| 容器编排 | Kubernetes | 行业标准 |
| 模型部署 | KServe | K8s 原生，LLM 专用 CRD |
| GPU 调度 | KAI Scheduler | NVIDIA 开源，性能好 |
| 可观测性 | Prometheus + Grafana + Loki | 开源标准栈 |
| API 网关 | Kong / Envoy | OpenAI 兼容适配 |

### 6.2 不做的

- 不自研推理引擎（vLLM 够用）
- 不写 CUDA Kernel（FlashAttention 已开源）
- 不做 200+ 模型（精选即可）
- 不做 Code Sandbox
- 不做 Fine-tuning（Phase 1 不做）

---

## 七、启步方式

**Phase 1：最小云产品**

- 2 个模型（Llama 8B + 70B）
- Serverless API（OpenAI 兼容）
- 基础控制台（API Key + token 消耗 + 费用）
- TokenCamp 作为第一个客户
- AWQ INT4 量化

**Phase 2：扩展**

- 更多模型
- Batch 推理
- 控制台增强（GPU 利用率、成本归因、告警）
- 预留容量

**Phase 3+**

- 私有化部署（客户驱动，不是主动推）
- 更多 Region

---

## 八、对比 Together AI

| | Together AI | Ultralisk |
|--|-----------|-----------|
| 推理引擎 | 自研（4x vLLM） | vLLM（~0.6-0.7x） |
| 模型数 | 200+ | 精选 10+ |
| 控制台可见性 | 基础 | 更完整（参考 Chamber） |
| 私有化 | 无 | 未来可做 |
| 定价 | 基准 | 目标更低 |
| 区域 | 25+ 城市 | 单一区域起步 |

---

*本文档是对 together.ai 和 usechamber.io 的分析总结，不是 PRD。细节展开后再写产品文档。*

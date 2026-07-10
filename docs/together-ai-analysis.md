# Together AI 深度分析 — Ultralisk 对标基准

> **版本**：v0.2（2026-07-09）
> **目的**：基于全面对标定位，深度解构 Together AI，为 Ultralisk 提供产品、技术、商业三层参考
> **定位纠正**：Ultralisk ≠ TokenCamp 内部项目。Ultralisk = **混合产品**（管控平台软件 + 推理 API 服务），**卖给所有人**，全面对标 Together AI

---

## 目录

1. [Together AI 全景画像](#一together-ai-全景画像)
2. [产品矩阵深度解构](#二产品矩阵深度解构)
3. [定价与收费模式](#三定价与收费模式)
4. [技术栈拆解](#四技术栈拆解)
5. [研究护城河](#五研究护城河)
6. [竞争格局](#六竞争格局)
7. [Together AI 的脆弱点](#七together-ai-的脆弱点)
8. [对 Ultralisk 的对标建议](#八对-ultralisk-的对标建议)
9. [关键指标对比](#九关键指标对比)
10. [行动项](#十行动项)

---

## 一、Together AI 全景画像

### 1.1 一句话定义

> **Together AI 是全球领先的全栈 AI 云平台**——从自研 CUDA Kernel 到推理 API 到 GPU 集群，覆盖 AI 推理、训练、微调全链路。它不是套壳云，是一家研究驱动的 AI 基础设施公司。

### 1.2 关键数据

| 维度 | 数据 |
|------|------|
| 成立时间 | 2022 年 |
| 总部 | 美国加州 |
| 核心人物 | Tri Dao（FlashAttention 作者，普林斯顿教授）、Percy Liang（斯坦福教授）、Ce Zhang（苏黎世联邦理工教授） |
| 研究产出 | 20+ 顶会论文（NeurIPS/ICML/ICLR） |
| 客户 | 典型 AI 企业（Cursor、ElevenLabs、Cohere、DeepMind、Salesforce、Zoom、Mozilla 等 30+） |
| 产品形态 | **纯 SaaS（公有云）**，无私有化部署选项 |
| 对标定位 | GPU 平台型公司（vs Groq/Cerebras 的芯片路线，vs DeepInfra 的价格路线） |

### 1.3 产品矩阵全景

Together AI 的产品是一个 **5 层漏斗**，从轻到重、从自服务到企业级：

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Serverless Inference（入口层，按 token）   │
│  最轻量，零配置，按 token 付费，50+ 模型             │
│  → 获取用户、展示能力                                │
├─────────────────────────────────────────────────────┤
│  Layer 2: Batch Inference（批量层，50% 折扣）        │
│  异步批量，30B tokens/模型，成本敏感场景             │
│  → 提高黏性，覆盖高吞吐场景                          │
├─────────────────────────────────────────────────────┤
│  Layer 3: Provisioned Throughput（预留层，$0.05/min）│
│  预留吞吐容量，99% SLA，token 包年包月               │
│  → 锁定生产级客户                                    │
├─────────────────────────────────────────────────────┤
│  Layer 4: Dedicated Endpoints（独享层，$6.49/hr）    │
│  独享 GPU 节点（H100/H200），自定义 Docker 镜像      │
│  → 性能敏感 / 合规要求客户                          │
├─────────────────────────────────────────────────────┤
│  Layer 5: GPU Clusters（集群层，$3.99-5.49/hr）     │
│  自服务集群（H100/B200/GB200），InfiniBand 互联      │
│  → DIY 训练/推理，深度用户                           │
└─────────────────────────────────────────────────────┘
```

**配套能力**（辅助产品线）：

| 产品 | 说明 |
|------|------|
| **Code Sandbox** | 与 CodeSandbox 合作，安全沙箱开发环境 |
| **Managed Storage** | 对象存储 + 并行文件系统，AI 原生，零出站费 |
| **Fine-Tuning** | LoRA + 全参数微调 |

### 1.4 商业模式解码

Together AI 的商业模式可以概括为 **"研究驱动 + 分层变现"**：

```
研究投入（护城河）
   ↓
FlashAttention / ThunderKittens / TIE 2.0 等
   ↓
推理速度 2x → 成本降低 60% 的叙事
   ↓
吸引开发者试用（Serverless，按 token）
   ↓
转化为生产客户（PTU / Dedicated / Cluster）
   ↓
收入支撑更多研究 ← 循环
```

**关键数据点**：
- 推理速度 2x（自研 vs 开源 vLLM）
- 成本比竞品低 60%（在某些 workload 下）
- H100 独享端点 $6.49/hr
- GPU 集群按需 $5.49/hr，预留（91-180 天）$3.99/hr

---

## 二、产品矩阵深度解构

### 2.1 Serverless Inference（入口产品）

**定位**：零门槛入口，展示 Together AI 的性能优势。

**核心特性**：
- 50+ 开源模型（Llama、DeepSeek、Qwen、Mistral 等）
- 按 token 付费，无最低消费
- 自动扩缩容，无冷启动延迟
- OpenAI 兼容 API
- 流式响应（SSE）

**对 Ultralisk 的启示**：
- Serverless 是**必备功能**，不是差异化功能
- 模型选择策略：**不是越多越好**——Ultralisk 应精选 10-20 个高质量模型，而不是堆数量
- OpenAI 兼容 API 是**必须遵守的行业标准**

### 2.2 Batch Inference（黏性产品）

**定位**：高吞吐、低成本场景，提高客户黏性。

**核心特性**：
- 异步处理，50% Serverless 价格折扣
- 最高 30B tokens/模型
- 结果回调通知

**对 Ultralisk 的启示**：
- Batch 是差异化机会：Together AI 只在 Serverless 模型上支持 Batch
- Ultralisk 可以支持**私有模型的 Batch 推理**——这是 Together AI 做不了的

### 2.3 Provisioned Throughput（锁定产品）

**定位**：生产级工作负载，锁定高价值客户。

**核心特性**：
- PTU（Provisioned Throughput Unit）$0.05/min
- 99%  uptime SLA
- token 包年包月折扣
- 与 Serverless 相同的 API，无需改代码

**定价机制**：
```
每月成本 = PTU 数量 × $0.05/min × 分钟数
         ≈ 1 PTU × $0.05 × 43800（月分钟数）
         = $2,190/月/PTU
```

**对 Ultralisk 的启示**：
- 这是 Together AI 的**利润中心**——锁定客户后，转换为可预测收入
- Ultralisk 需要类似的**容量承诺**产品——但定价策略可以更激进
- PTU 模式适合**企业级客户**

### 2.4 Dedicated Endpoints（利润产品）

**定位**：性能/安全敏感客户的高利润产品。

**核心特性**：
- 独享 GPU（H100/H200/B200）
- 自定义 Docker 镜像
- 自动扩缩容
- 指标监控

**对 Ultralisk 的启示**：
- Dedicated Endpoints 是 Together AI 最高利润的产品线
- Ultralisk 的**私有化部署方案**可以直接竞争这一层——企业买断而不是租用
- 这是 Ultralisk 的**核心差异化战场**

### 2.5 GPU Clusters（DIY 产品）

**定位**：深度用户的 DIY 训练/推理平台。

**核心特性**：
- 自服务集群创建
- H100/H200/B200/GB200 多种 GPU
- InfiniBand 互联
- 按需 / 预留 / 托管多种模式

**对 Ultralisk 的启示**：
- GPU Clusters 本质是卖**裸金属算力**——不是 Ultralisk 的核心方向
- 但如果 Ultralisk 自己有 GPU 集群，可以作为**底层能力**复用
- 优先级低于推理 API 和管控平台

### 2.6 产品矩阵总结

| 产品 | Together AI | Ultralisk 要做吗？ | 优先级 | 差异化机会 |
|------|------------|-------------------|--------|-----------|
| Serverless Inference | ✅ 50+ 模型 | ✅ 精选 10-20 模型 | P0 | 私有化 + 可控成本 |
| Batch Inference | ✅ 50% 折扣 | ✅ | P1 | 私有模型 Batch |
| Provisioned Throughput | ✅ $0.05/min PTU | ✅ 类似模式 | P1 | 更灵活的容量方案 |
| Dedicated Endpoints | ✅ $6.49/hr | ✅ **私有化部署** | P0 | **Together AI 没有** |
| GPU Clusters | ✅ 自服务 | ⚠️ 可选 | P2 | 不是核心方向 |
| Code Sandbox | ✅ 与 CodeSandbox 合作 | ❌ | - | 不做 |
| Managed Storage | ✅ 对象存储 + 并行 FS | ⚠️ 可选 | P2 | 可集成第三方 |
| Fine-Tuning | ✅ LoRA + 全参 | ⚠️ 可选 | P2 | 私有数据微调 |

---

## 三、定价与收费模式

### 3.1 定价体系（2026 年）

**Serverless 定价示例**（/1M tokens）：

| 模型 | 输入 | 输出 | 备注 |
|------|------|------|------|
| DeepSeek V4 Pro | $1.74 | $3.48 | 旗舰模型，最贵 |
| Llama 3.3 70B Turbo (FP8) | $1.04 | $1.04 | 主力模型 |
| Llama 3.1 8B Instruct | ~$0.15 | ~$0.15 | 入门级 |
| Qwen 2.5 72B | ~$0.90 | ~$0.90 | 中文模型 |
| DeepSeek V4 Pro (Batch) | $0.87 | $1.74 | 50% 折扣 |

**Dedicated Endpoints 定价**：

| GPU 类型 | 按需（/hr） | 预留 91-180 天（/hr） |
|---------|-----------|---------------------|
| H100 80GB | $6.49 | $3.99 |
| H200 | 更高 | 待确认 |

### 3.2 定价策略分析

Together AI 的定价策略可以归纳为：

1. **按 token 收费是行业标准**——跟随 OpenAI 的定价模式
2. **Batch 50% 折扣**——激励客户使用异步模式，平滑负载
3. **PTU $0.05/min**——按时间计费而不是 token，适合高吞吐客户
4. **独享 $6.49/hr**——GPU 利用率 100% 时的成本优势

### 3.3 Together AI 的成本结构（估值）

```
Together AI 的成本结构（每 $1 收入）：
├─ GPU 硬件摊销         $0.25-0.35
├─ 数据中心运营          $0.10-0.15
├─ 研发团队              $0.10-0.15
├─ 销售与市场            $0.15-0.20
├─ 管理/其他             $0.05-0.10
├─ 利润                  $0.10-0.20
```

**关键洞察**：Together AI 的毛利润率估计在 **40-60%**——它的 GPU 硬件成本不是主导因素，研发和销售才是。

### 3.4 对 Ultralisk 定价的启示

```
Ultralisk 的成本结构优势：

1. 没有研发成本（不自己写 CUDA Kernel 和推理引擎）
   → 省 10-15%

2. 没有销售和市场团队（社区驱动 + 直接销售）
   → 省 15-20%

3. 私有化部署：客户出硬件
   → 省 25-35%（GPU 摊销）

合计：Ultralisk 的定价可以比 Together AI 低 30-50% 并保持相同利润率
```

---

## 四、技术栈拆解

### 4.1 Together AI 的推理引擎栈

Together AI 不依赖 vLLM/SGLang/TGI——它有自己的**自研推理引擎 TIE 2.0**：

```
Together Inference Engine 2.0
│
├── CUDA Kernel 层
│   ├── FlashAttention-4（自研）
│   │   ├── B200 上 71% 利用率（1605 TFLOPs/s）
│   │   ├── 比 cuDNN 9.13 快 1.3x
│   │   └── 比 Triton 快 2.7x
│   ├── ThunderKittens（自研 DSL）
│   │   └── 简化 CUDA Kernel 编写，适配 Blackwell
│   ├── FlashFFTConv（高效卷积）
│   └── Chipmunk（DiT 加速）
│
├── 推理优化层
│   ├── Speculative Decoding 系列
│   │   ├── ATLAS（运行时学习加速器）
│   │   ├── Sequoia（硬件感知推测解码）
│   │   ├── SpecExec（消费设备并行推测解码）
│   │   ├── Medusa（多解码头加速）
│   │   └── Distribution-aware（RL rollout 加速 50%）
│   ├── Prefill-Decode 分离（CPD）
│   │   └── 长上下文推理加速 40%
│   ├── 量化
│   │   ├── QTIP（模型保留自适应舍入）
│   │   ├── TEAL（训练后激活稀疏）
│   │   └── FP8 推理
│   ├── Continuous Batching
│   └── KV-cache 优化
│
├── 调度层
│   ├── KV-cache 感知路由
│   ├── Cache-aware Prefill-Decode Disaggregation
│   └── 多模型共享 GPU
│
└── API 层
    ├── OpenAI 兼容 API
    ├── 流式/非流式
    └── 多模型路由
```

### 4.2 Together Kernel Collection (TKC)

Together AI 的**预训练加速工具包**：

- 为 NVIDIA H100/B200/HGX 优化
- 宣称预训练速度提升 **90%**
- 与 NVIDIA 深度合作（TKC on HGX B200）

**这不是 Ultralisk 需要关注的方向**——预训练优化对于推理 Provider 不是核心需求。

### 4.3 与开源方案的关键差距

| 能力 | Together AI（自研） | 开源方案（vLLM/SGLang） | 差距 |
|------|-------------------|----------------------|------|
| FlashAttention | v4（自研） | v3（vLLM 已集成 v3） | **1-2 代差距** |
| Speculative Decoding | ATLAS/Sequoia/SpecExec/Medusa | Medusa（开源版可用） | **3-4 种算法优势** |
| Prefill-Decode 分离 | CPD 生产级 | KServe+llm-d 实验性 | **成熟度差距** |
| Quantization | QTIP/TEAL/FP8 | AWQ/GPTQ/FP8 | **2-3 种额外方案** |
| Kernel DSL | ThunderKittens | Triton（开源） | **方向不同** |
| Continuous Batching | 自研 | PagedAttention（vLLM） | **差距在细节** |
| KV-cache 管理 | 自研优化 | PagedAttention | **差距在细节** |

**核心判断**：Together AI 的技术栈领先开源方案约 **1-2 年**。但差距在缩小中（FlashAttention 已开源、Medusa 已开源）。

### 4.4 对 Ultralisk 的技术启示

```
Ultralisk 的技术策略：

不需要追赶的：
❌ 自研 CUDA Kernel（FlashAttention 已开源，直接用）
❌ 自研推理引擎（vLLM 足够好，持续跟进即可）
❌ Kernel DSL（ThunderKittens/Triton 不需要）

需要关注的：
⚠️ Speculative Decoding（开源方案成熟后可集成）
⚠️ Prefill-Decode 分离（KServe+llm-d 成熟后可用）
⚠️ 高级量化（关注 QTIP/TEAL 开源进展）

需要自研的：
✅ GPU 利用率调度（Ultralisk 核心差异化）
✅ 多租户隔离（企业客户必需）
✅ 成本归因/计量（商业产品必备）
```

---

## 五、研究护城河

### 5.1 研究产出总览

Together AI 的研究团队是**世界级的**——这不是营销包装，是真实的学术影响力：

| 研究方向 | 代表成果 | 顶会 | 商业影响 |
|---------|---------|------|---------|
| **Kernels** | FlashAttention (v1-v4) | NeurIPS/ICML | **推理速度 2x** |
| **Kernels** | ThunderKittens | - | **简化 CUDA 开发** |
| **Kernels** | FlashFFTConv | ICML | **高效序列模型** |
| **Kernels** | ParallelKernelBench | ICML 2026 | **LLM 写不好 kernel 的基准** |
| **Inference** | TIE 2.0 | - | **4x vs vLLM（自称）** |
| **Inference** | Medusa | - | **多解码头加速** |
| **Inference** | SpecExec/Sequoia/ATLAS | - | **推测解码系列** |
| **Inference** | CPD (Prefill-Decode) | - | **长上下文 40% 加速** |
| **Inference** | QTIP/TEAL | - | **高级量化** |
| **Architecture** | Mamba-3 | ICML | **状态空间模型** |
| **Architecture** | StripedHyena | - | **超越 Transformer** |
| **Architecture** | Monarch Mixer/BASED | - | **线性注意力** |
| **Architecture** | LoLCATs | - | **线性化 LLM** |
| **Architecture** | Parcae (循环模型) | - | **更少参数更多能力** |
| **Data** | RedPajama-v2 (30T tokens) | - | **开源数据集标杆** |
| **Agents** | Mixture-of-Agents | - | **多模型协同** |
| **Agents** | DeepSWE/DeepCoder | - | **代码 Agent SOTA** |
| **Agents** | CoderForge | - | **训练数据开源** |
| **Agents** | Open Deep Research | - | **研究 Agent** |
| **Safety** | Llama Guard | - | **内容安全** |

### 5.2 研究投入的成本

Together AI 的研究团队估计 **20-30 人**，年投入 **$5-10M**。这些研究不是成本中心，而是**壁垒打造者**：

```
研究投入  → 技术成果  → 性能优势  → 价格溢价  → 收入增长  → 更多研究
```

**但对 Ultralisk 来说**：这不是需要复制的模式。Together AI 的研究成果**大部分已开源**，Ultralisk 可以站在巨人肩膀上。

### 5.3 研究方面对 Ultralisk 的建议

```
要做的：
✅ 密切跟进 Together AI 的开源（FlashAttention、Medusa 等）
✅ 当技术成熟了果断采用（不要 wait 太久）
✅ 把工程资源聚焦在开源方案已覆盖但没做好的地方

不要做的：
❌ 不自建研究团队（20 人团队每年 $5-10M，不是早期公司该做的）
❌ 不追求论文发表
❌ 不在未成熟的自研技术上押注
```

---

## 六、竞争格局

### 6.1 AI Infra Provider 生态图

```
                 性能（速度）
                     ↑
           Groq（定制 LPU 芯片）
           Cerebras（晶圆级芯片）
                     |
                     |    Together AI（研究驱动，全栈）
                     |    Fireworks AI（GPU 全栈，相似定位）
                     |
           DeepInfra（性价比路线）
                     |
           云厂商 GPU 实例（AWS/GCP/Azure）
                     ↓
                 价格（低）
```

### 6.2 主要竞品对比

| 维度 | Together AI | Fireworks AI | DeepInfra | Groq | Ultralisk（目标） |
|------|------------|-------------|----------|------|-----------------|
| **GPU 类型** | H100/H200/B200/GB200 | H100 | H100 | **自研 LPU** | H100/B200 |
| **推理引擎** | **自研 TIE 2.0** | vLLM 优化版 | vLLM | LPU 原生 | vLLM+ |
| **模型数量** | 50+ | 100+ | 50+ | 30+ | **精简 10-20** |
| **价格水平** | 基准 | 相近 | **低 30-60%** | 中 | **目标低 30-50%** |
| **速度** | 基准 x1 | ~0.8x | ~0.7x | **快 2-3x** | ~0.7x |
| **微调** | ✅ | ✅ | ❌ | ❌ | ⚠️ 可选 |
| **Batch** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **私有化部署** | ❌ | ❌ | ❌ | ❌ | ✅ **核心差异化** |
| **GPU 集群** | ✅ | ❌ | ❌ | ❌ | ⚠️ 可选 |
| **Code Sandbox** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **研究产出** | **世界级** | 少 | 无 | 中 | ❌ 不需要 |

### 6.3 竞争格局关键洞察

1. **市场在二分**：定制芯片公司（Groq/Cerebras）比原始速度，GPU 平台公司（Together/Fireworks/DeepInfra）比全栈和价格
2. **DeepInfra 在打价格战**——比 Together AI 便宜 30-60%
3. **Together AI 的应对**：用研究驱动性能优势来维持价格溢价
4. **Fireworks AI 最接近 Together AI**——两者在模型数量和全栈能力上直接竞争
5. **没有人在做私有化部署**——这是一个**明确的空白市场**

### 6.4 Ultralisk 的差异化定位

```
公有云推理 API 市场（红海）
├── Together AI（研究驱动型）
├── Fireworks AI（全栈型）
├── DeepInfra（价格驱动型）
├── Groq/Cerebras（速度驱动型）

私有化部署市场（蓝海，Together AI 不做）
└── ⭐ Ultralisk
    └── 把 Together AI 的能力打包成企业私有化方案
```

**核心差异化**：

| 差异化维度 | Together AI | Ultralisk |
|-----------|------------|-----------|
| 部署方式 | 公有云 SaaS 只有 | ✅ **公有云 API + 私有化部署** |
| 数据主权 | 数据经过 Together AI | ✅ **私有化：数据完全在客户域内** |
| 模型选择 | 50+ 通用模型 | ✅ **精选模型 + 客户私有模型** |
| 定价 | 按 token / 按 PTU | ✅ **灵活定价（买断 / 订阅 / 按量）** |
| 定制程度 | 通用优化 | ✅ **可针对客户场景深度定制** |
| 合规认证 | SOC2/ISO27001 | ✅ **私有化部署满足最严合规要求** |

---

## 七、Together AI 的脆弱点

### 7.1 结构性弱点

Together AI 不是不可战胜的。以下是它的结构性脆弱点：

#### 1️⃣ 只有公有云，没有私有化部署

这是 Together AI **最大的弱点**。对于以下客户，Together AI 根本无法服务：

- **金融行业**：数据不能出域，监管要求严格
- **医疗行业**：HIPAA 合规，患者数据敏感
- **政务/国防**：数据主权要求
- **大型企业**：内部合规政策禁止使用外部 API
- **有存量 GPU 的企业**：已经买了 GPU，想要用起来

**Ultralisk 的机会**：私有化部署方案直接解决这个问题。这是 Together AI 的**结构性盲区**。

#### 2️⃣ 研究驱动的成本结构

Together AI 的研发投入是优势也是劣势：
- 每年 $5-10M 的研究成本必须通过定价回收
- 这意味着 Together AI 在价格上**无法和 DeepInfra 竞争**
- 中小客户对"极致性能"不敏感，但对价格敏感

**Ultralisk 的机会**：没有研究成本包袱，定价可以更灵活。

#### 3️⃣ 模型广度不如 Fireworks

Fireworks AI 的模型数量（100+）是 Together AI（50+）的两倍。Together AI 在模型生态上**不是第一**。

**Ultralisk 的机会**：精选模型策略反而可以避免"模型太多不知道怎么选"的客户困惑。

#### 4️⃣ 客户获取成本高

ToB 销售 + 市场活动 + 品牌建设的成本很高。Together AI 的客户名单虽然是 Cursor/Cohere 级别的，但这些客户获取成本不低。

**Ultralisk 的机会**：社区驱动 + 产品体验驱动的获客模式成本更低。

#### 5️⃣ 价格战风险

DeepInfra 已经证明了"便宜 30-60%"的商业模式可行。如果 DeepInfra 持续降价，Together AI 的选择只有：
- 跟进降价 → 利润受压
- 不跟进 → 失去价格敏感客户

**Ultralisk 的机会**：私有化部署不存在直接价格战——这是一个**不同的购买决策框架**。

### 7.2 技术脆弱点

1. **自研引擎的技术债**——维护自研推理引擎需要持续投入，如果团队变动，风险高
2. **NVIDIA 依赖**——所有优化都基于 NVIDIA GPU，如果 AMD/Intel 崛起，适配成本高
3. **开源追赶**——vLLM 等开源方案快速进步，Together AI 的"4x 优势"可能在 1-2 年内被缩小

### 7.3 Together AI 无法复制 Ultralisk 的理由

如果 Together AI 想要做私有化部署：

```
Together AI 的困境：
- 商业模式是 SaaS（经常性收入），私有化是买断（一次性收入）
- 收入结构冲突：SaaS 收入和私有化收入在一个公司内难以共存
- 技术架构差异：多租户架构 vs 单租户架构
- 运维成本：私有化部署需要 ToB 服务团队
- 销售团队：需要招募企业销售（而不是云销售）

→ Together AI 做私有化部署的转型成本极高，短期不会做
→ 这是 Ultralisk 的时间窗口
```

---

## 八、对 Ultralisk 的对标建议

### 8.1 产品层：三层对标策略

```
                 Ultralisk 的产品分解
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  公有云 API         管控平台          私有化方案
  (对标 Together)   (Together 没有)   (Together 没有)
        │                │                │
        ▼                ▼                ▼
  精选 10-20 模型     统一控制台       企业交钥匙部署
  按 token 收费       集群/节点/模型    买断/订阅
  Serverless+Batch   多租户隔离        客户自持 GPU
  OpenAI 兼容        成本归因          数据合规
```

**三条产品线的关系**：

```
公有云 API (引流) → 企业试用后 → 私有化/管控平台 (成交)
                      ↑
管控平台 (独立销售) → 已自建 GPU 的企业
                      ↑
私有化方案 (大客户) → 合规要求高的企业
```

### 8.2 技术层：差异化追赶策略

| 能力分层 | 策略 | 具体行动 |
|---------|------|---------|
| **P0 必须（持平 Together AI）** | 使用开源方案，做到够用 | vLLM + AWQ + KServe |
| **P1 差异化（超越 Together AI）** | 自研私有化部署能力 | 私有化一键部署、多租户隔离、企业控制台 |
| **P2 加分（追赶 Together AI）** | 集成开源前沿成果 | Speculative Decoding、Prefill-Decode 分离 |
| **不做（不跟 Together AI 比）** | 承认差距，不浪费资源 | 自研 CUDA Kernel、研究团队 |

### 8.3 定价层：双层定价模型

```
公有云 API（对标 Together AI，但便宜 30-50%）：
├── Serverless：按 token，比 Together AI 低 30-50%
├── Batch：Serverless 价格 50%
└── 预留容量：按月/按年承诺，锁定折扣

私有化部署（Together AI 没有的定价模式）：
├── 软件许可：按 GPU 数量年费
├── 交钥匙方案：硬件 + 软件一次性报价 + 年运维费
└── 混合模式：基础年费 + 超出部分的按量费用
```

### 8.4 市场层：优先攻占的细分市场

| 细分市场 | 客户痛点 | 购买力 | 优先度 |
|---------|---------|-------|-------|
| **金融/保险** | 数据不能出域，监管合规 | 高 | ⭐ P0 |
| **医疗/制药** | HIPAA/隐私合规 | 高 | ⭐ P0 |
| **政务/国企** | 数据主权，国产化 | 中-高 | P1 |
| **已有 GPU 的企业** | GPU 闲置，想用起来 | 中 | P1 |
| **AI 创业公司（API）** | 价格敏感，不想绑死一家 | 低-中 | P2 |
| **教育/科研** | 预算有限，需要私有化 | 低 | P3 |

### 8.5 Ultralisk 不应该从 Together AI 学的事

```
Together AI 做了但 Ultralisk 不应该做的事：

❌ 不要上 50+ 模型（维护成本高，用户选择困难）
❌ 不要自研推理引擎（vLLM 足够好）
❌ 不要建研究团队（成本高，回报周期长）
❌ 不要做 Code Sandbox（不是核心场景）
❌ 不要做 GPU Clusters 自助服务（运维成本高）
❌ 不要做 Fine-tuning as a Service（除非客户明确需要）
❌ 不要在早期做多区域部署（成本高，复杂度高）
```

---

## 九、关键指标对比

### 9.1 产品能力对比

| 维度 | Together AI | Ultralisk（目标） |
|------|------------|-----------------|
| **公有云推理 API** | ✅ 50+ 模型 | ✅ 10-20 模型 |
| **私有化部署** | ❌ | ✅ **核心差异化** |
| **管控平台** | ❌ | ✅ **核心差异化** |
| **Serverless 推理** | ✅ | ✅ |
| **Batch 推理** | ✅ 50% 折扣 | ✅ |
| **预留容量** | ✅ PTU $0.05/min | ✅ |
| **独享端点** | ✅ $6.49/hr | ✅ 私有化方案 |
| **GPU 集群** | ✅ | ⚠️ 可选 |
| **微调** | ✅ | ❌ Phase 2 评估 |
| **Code Sandbox** | ✅ | ❌ |
| **Managed Storage** | ✅ | ❌ 集成第三方 |
| **OpenAI 兼容** | ✅ | ✅ |

### 9.2 技术指标对比

| 指标 | Together AI | Ultralisk MVP | Ultralisk Phase 2-3 |
|------|------------|--------------|-------------------|
| 推理引擎 | **自研 TIE 2.0** | vLLM | vLLM + 优化 |
| 推理速度 | 基准 x1 | ~0.6-0.7x | ~0.7-0.85x |
| GPU 利用率 | 60-80%（多租户平滑） | 30-40% | 50-70%（调度优化后）|
| TTFT p95 | <200ms | <500ms | <300ms |
| 模型推理 | 50+ 模型 | 2 模型 | 10-20 模型 |
| 量化 | QTIP/TEAL/FP8 | AWQ INT4 | AWQ + FP8 |
| Prefill-Decode 分离 | ✅ 生产级 | ❌ | KServe+llm-d 集成 |
| Speculative Decoding | 5+ 实现 | ❌ | Medusa 开源集成 |
| 多租户 | ✅ 多租户 SaaS | ❌（单租户） | ✅ Phase 2+ |

### 9.3 商业模式对比

| 维度 | Together AI | Ultralisk |
|------|------------|-----------|
| **收入来源** | API 按 token | API 按 token + 软件许可 + 服务 |
| **毛利率** | 40-60% 估计 | **目标 60-80%**（无研究成本） |
| **客户 LTV** | 中（API 弹性流失） | **高**（私有化绑定） |
| **获客成本** | 高（ToB 销售） | **低**（社区/产品驱动） |
| **市场大小** | API 市场 | **API + 私有化 + 管控平台**三市场 |
| **可防御性** | 研究壁垒 | **私有化 + 数据合规壁垒** |

### 9.4 关键财务估算

| 场景 | Together AI 成本 | Ultralisk 成本 | 差异 |
|------|----------------|---------------|------|
| Llama 70B 推理（/1M tokens） | $1.04 | **$0.50-0.70**（省 32-52%） |
| 100 GPU/月运营 | $150K-200K（云租赁） | **$80-120K**（自建）|
| 企业私有化部署（100 GPU） | ❌ 不可用 | **$30-50K/月**（软件许可）|

---

## 十、行动项

### 10.1 立即更新 PRD

旧 PRD（提交 ea19ef2）的假设是"只服务 TokenCamp，不对外"。需要更新：

- [ ] 更新一句话定义：**"Ultralisk = 商业版自托管 Together AI + 私有化管控平台"**
- [ ] 添加对外客户的产品描述和场景
- [ ] 添加用户系统、多租户、计费等功能需求
- [ ] 更新路线图，加入私有化部署和管控平台
- [ ] 改写"不做什么"章节（旧版说的不做现在都需要做）

### 10.2 产品线优先级建议

```
Phase 1（1-3 月）：公有云 API MVP
- 2 个模型（8B + 70B）
- OpenAI 兼容 API
- Serverless + Batch
- 基础监控
- TokenCamp 作为第一个客户

Phase 2（3-6 月）：公有云 + 管控平台
- 扩展至 10 个模型
- 管控平台 v1（集群/节点/模型管理）
- 多租户隔离
- 用户系统 + API Key 管理
- 基础计费（按 token）

Phase 3（6-12 月）：私有化部署
- 私有化一键部署方案
- 企业控制台
- 高级计费（预留容量 / 订阅）
- 合规认证（SOC2/ISO27001）
- 成本归因 + 审计日志

Phase 4（12-18 月）：全栈平台
- 20 模型
- 高级优化（推测解码 / Prefill-Decode 分离）
- GPU 利用率优化（L2 智能调度）
- 客户私有模型支持
- 专业服务团队
```

### 10.3 营销定位更新

基于纠正后的定位，Ultralisk 的营销叙事应该是：

> **Ultralisk 是 Together AI 的私有化替代方案**

而不是：
> ❌ "Ultralisk 是 TokenCamp 的内部推理平台"

**关键营销信息**：
1. "把 Together AI 搬进你的数据中心"——私有化部署
2. "比 Together AI 便宜 30-50%"——成本优势
3. "一个控制台管好所有 GPU"——管控平台
4. "数据不出域，合规无忧"——数据主权

### 10.4 竞争策略总结

| Together AI 强在哪里 | 我们怎么办 |
|---------------------|-----------|
| 自研推理引擎（2-4x 快） | 承认差距，用性价比和私有化弥补 |
| 研究驱动（20+ 论文） | **不跟着卷**，聚焦产品体验 |
| 品牌知名度（30+ 知名客户） | 社区驱动 + 口碑传播 |
| 模型生态（50+） | 精选 10-20 个最高质量模型 |

| Together AI 弱在哪里 | 我们怎么办 |
|---------------------|-----------|
| **没有私有化部署** | ✅ **这是 Ultralisk 的核心战役** |
| **只能公有云** | ✅ 公有云（对标）+ 私有化（差异化）|
| **研究成本高 = 定价高** | ✅ 没有研究包袱，定价灵活 |
| **多租户安全顾虑** | ✅ 私有化解决 |
| **ToB 销售成本高** | ✅ 社区驱动 + 产品体验驱动 |

---

## 附录：关键术语

| 术语 | 解释 |
|------|------|
| **TIE 2.0** | Together Inference Engine 2.0，Together AI 自研推理引擎 |
| **FlashAttention** | IO-aware 的注意力机制 CUDA 实现，Together AI 核心成果 |
| **ThunderKittens** | Together AI 自研的 CUDA Kernel DSL |
| **PTU** | Provisioned Throughput Unit，预留吞吐量单位 |
| **TKC** | Together Kernel Collection，预训练加速工具包 |
| **Speculative Decoding** | 推测解码，用小模型预测加速大模型推理 |
| **Prefill-Decode 分离** | 把 LLM 推理拆成两阶段独立调度 |
| **CPD** | Cache-aware Prefill-Decode Disaggregation |
| **QTIP** | Together AI 的量化和训练后优化框架 |
| **TEAL** | Training-Free Activation Sparsity |

---

*本文档基于 2026-07-09 的公开信息和 Together AI 官网分析编写，定价和产品信息可能随时间变化。*

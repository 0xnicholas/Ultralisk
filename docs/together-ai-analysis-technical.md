# Together AI 深度分析（下）：技术架构与商业解构

> **承接上篇**（together-ai-analysis.md），本篇聚焦技术实现细节、工程架构和商业模式拆解
> **目的**：为 Ultralisk 的工程实现和产品策略提供可落地的参考

---

## 一、Together AI 公司基本面

### 1.1 关键数据

| 维度 | 数据 | 来源/备注 |
|------|------|----------|
| 成立时间 | 2022 年 6 月 | - |
| 创始人 | Vipul Ved Prakash（CEO）、Ce Zhang（CTO）、Chris Ré、Tri Dao（首席科学家）、Percy Liang | 学术+工程双重背景 |
| 累计融资 | $800M Series C（2026年7月）| 领投：Aramco Ventures，参与：NVIDIA |
| 估值 | **$8.3B** | 2026年7月 |
| 年化收入 | **$1B**（2026年2月）| Sacra 估算 |
| 年度签约 | **$1.15B** | 含预留容量等长单 |
| 员工规模 | ~200-300人（估算） | 含研究团队20-30人 |
| 客户 | 30+ 知名企业 | Cursor、ElevenLabs、Cohere、DeepMind、Salesforce 等 |
| GPU 容量 | 2GW+ 全球电力容量，600MW 美国近期容量 | 欧洲合作2GW |
| 覆盖区域 | 25+ 城市全球 | 含 EU 数据中心（合规） |
| 模型数量 | **200+** | 含文本、图像、视频、代码、音频 |

### 1.2 融资格局的意义

```
Series C $800M 的用途拆解（估算）：
├─ GPU 硬件采购（CapEx）      $500-600M  ← 买卡
├─ 数据中心建设                $100-150M  ← 扩张
├─ 研发团队扩充                $50-80M    ← 研究
├─ 销售与市场                  $30-50M    ← 获客
└─ 运营储备                    $20-30M
```

**对 Ultralisk 的启示**：
- Together AI 的估值倍数 ≈ **8.3x 年化收入**——AI Infra 公司估值逻辑
- $800M 融资额是"军备竞赛"级别的——Ultralisk 不需要这个量级
- NVIDIA 参与投资说明**硬件厂商也在押注平台层**

---

## 二、推理引擎架构深度拆解

### 2.1 Together Inference Engine 2.0 架构

这是 Together AI 的技术核心。理解它，才能明白 Ultralisk 应该追赶什么、放弃什么。

```
                    Together Inference Engine 2.0
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
     Kernel 优化层      推理调度层        量化压缩层
            │                 │                 │
            ▼                 ▼                 ▼
  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
  │ FlashAttention-4│ │ CPD 分离调度     │ │ NVFP4 / INT4    │
  │ 71% util (B200) │ │ Cache-aware      │ │ QTIP（自适应）  │
  │ >cuDNN 1.3x     │ │ Prefill-Decode   │ │ TEAL（激活稀疏）│
  │ >Triton 2.7x    │ │ 35-40%吞吐提升   │ │ AWQ / GPTQ      │
  ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
  │ ThunderKittens  │ │ Speculative      │ │ FP8 推理        │
  │（CUDA DSL）     │ │ Decoding 系列    │ │                 │
  │                 │ │ ATLAS / Sequoia  │ │                 │
  │                 │ │ Medusa / SpecExec│ │                 │
  ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
  │ GEMM 优化       │ │ Continuous       │ │ KV-cache 量化   │
  │ Operator Fusion │ │ Batching         │ │                 │
  └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 2.1.1 Kernel 优化层

**FlashAttention-4**（2026年最新）：

```
硬件：NVIDIA B200 / GB200
精度：BF16
性能：1605 TFLOPs/s = 71% 利用率
对比：
  → cuDNN 9.13：快 1.3x
  → Triton：快 2.7x

核心技术：
1. Tensor Memory (TMEM) 利用——B200 新增片上内存
2. 异步流水线——计算和数据传输重叠
3. 非对称硬件适配——B200 的 5 代 Tensor Core 特性
```

**ThunderKittens**（自研 CUDA DSL）：

```
定位：让写 CUDA Kernel 更简单的嵌入式 DSL
特点：
- 专门为 AI 算子优化
- 比 Triton 更底层，性能更高
- 支持 NVIDIA Blackwell
- 已开源

作用：加速 Together AI 内部 Kernel 开发速度
```

**对 Ultralisk 的意义**：
- **FlashAttention 已开源**（v1-v4），vLLM 已集成 v3，v4 预计也会跟进
- Ultralisk **不需要自己写 Kernel**，直接使用 vLLM 集成的版本即可
- ThunderKittens 对 Ultralisk **没有直接价值**（不写 Kernel）

#### 2.1.2 推理调度层

**Cache-aware Prefill-Decode Disaggregation (CPD)**：

```
传统架构：
  请求 → [Prefill + Decode 在同一 GPU] → 响应
  问题：Prefill 计算密集但短，Decode 访存密集但长
        两者资源争抢，谁都跑不好

CPD 架构：
  
  请求 → Cache-aware Router
         │
         ├─ 冷请求（cache miss）→ Prefill Pool（计算优化）
         └─ 热请求（cache hit） → Decode Pool（访存优化）
  
  效果：
  - Prefill GPU 专注处理 prompt，发挥计算能力
  - Decode GPU 专注 token 生成，利用 cache
  - 长上下文（100K+ tokens）吞吐提升 35-40%
  - 标准非 cache-aware 分离也有 1.5-2.5x 提升
```

**Speculative Decoding 系列**：

Together AI 至少有 **5 种**推测解码实现，形成矩阵：

| 方案 | 定位 | 加速比 | 适用场景 |
|------|------|--------|---------|
| **Medusa** | 多解码头 + 草稿模型 | 2-3x | 通用对话 |
| **Sequoia** | 硬件感知树搜索 | 1.5-2x | 高吞吐批量 |
| **SpecExec** | 消费设备并行推测 | 2x+ | 端侧部署 |
| **ATLAS** | 运行时学习加速器 | 运行时自适应 | 动态场景 |
| **Distribution-aware** | RL rollout 加速 | 50% | 强化学习训练 |

**对 Ultralisk 的意义**：
- **Medusa 已开源**——可以直接集成到 vLLM
- 其他方案**可以等开源或自己实现简化版**
- Speculative Decoding 是**性价比最高的优化**——不需要改硬件，纯软件优化 2x

#### 2.1.3 量化压缩层

| 方案 | 精度 | 显存节省 | 质量影响 | 状态 |
|------|------|---------|---------|------|
| AWQ | INT4 | 4x | 极小 | 开源，vLLM 原生支持 |
| GPTQ | INT4 | 4x | 极小 | 开源，vLLM 原生支持 |
| NVFP4 | FP4 | 8x | 中 | NVIDIA Blackwell 原生 |
| QTIP | 自适应 | 2-4x | 极小 | Together 自研，未开源 |
| TEAL | 激活稀疏 | 1.5x | 小 | Together 自研，未开源 |
| FP8 | FP8 | 2x | 极小 | 开源，H100 原生支持 |

**对 Ultralisk 的意义**：
- **AWQ INT4 是 MVP 最佳选择**——开源、稳定、效果好
- FP8 是 H100 原生支持的第二优先
- QTIP/TEAL 可跟踪，但不急

### 2.2 性能数据解读

Together AI 宣称的性能数据：

| 场景 | 宣称性能 | 可比基线 |
|------|---------|---------|
| Llama 3 8B | **400+ tokens/s** | vLLM ~100-200 tokens/s |
| Llama 3 70B | 未公布具体数据 | vLLM ~50-100 tokens/s |
| Prefill-Decode 分离 | **1.5-2.5x** 吞吐提升 | 不分离 |
| CPD（cache 感知） | **35-40%** 额外提升 | 标准分离 |
| B200 FlashAttention-4 | **71%** 利用率 | cuDNN ~55% |

**关键判断**：
- "4x vs vLLM" 是**特定场景的峰值性能**，不是所有场景的均值
- 实际生产中（多用户、混合负载），差距可能在 **1.5-2x**
- 但这些性能数据**不是假的**——Together AI 确实有工程实力的支撑

**对 Ultralisk 的启示**：
- vLLM + AWQ + 合理配置 = Together AI 的 **50-70% 性能**
- 加入 FP8 + Medusa = **70-85%**
- 再往上需要 CPD/Kernel 优化 = **85-95%**
- 最后 5-15% 的极致性能**不值得追**（边际成本过高）

---

## 三、基础设施布局

### 3.1 GPU 容量与覆盖

| 维度 | Together AI | 含义 |
|------|------------|------|
| 全球覆盖 | 25+ 城市 | 边缘推理能力 |
| 电力容量 | **2GW+** 投资组合 | 可支撑 ~500K H100 |
| 美国近期容量 | 600MW | 约 150K H100 |
| 欧洲合作 | 2GW 数据中心 | 未来扩张 |
| EU 合规 | 欧盟数据中心 | 数据主权客户 |

**对 Ultralisk 的启示**：
- Together AI 的规模是**超大规模云**级别的——Ultralisk 不需要这个量级
- Ultralisk 的私有化部署方案天然解决"区域覆盖"问题——客户自己部署
- **EU 合规是 Together AI 的加分项，但客户仍然不能完全控制数据**

### 3.2 GPU 选型

| GPU 类型 | 可用性 | 定位 | 定价（按需/hr） |
|---------|-------|------|---------------|
| H100 80GB | ✅ 主流 | 推理主力 | $2.99-6.49 |
| H200 141GB | ✅ | 大模型/长上下文 | 更高 |
| B200 | ✅ 最新 | 旗舰推理/训练 | $11.95 |
| GB200 NVL72 | ✅ | 超大规模训练 | 更高 |

**对 Ultralisk 的启示**：
- H100 是**推理性价比之王**——当前最佳选择
- B200 性能好但贵 2x——适合高端场景
- Ultralisk MVP 应该**锁定 H100**，B200 作为 Phase 2+ 选项

---

## 四、API 协议与产品细节

### 4.1 API 接口清单

Together AI 提供完整的 OpenAI 兼容 API，外加一些扩展：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | 聊天补全（核心） |
| `/v1/completions` | POST | 文本补全 |
| `/v1/embeddings` | POST | Embedding |
| `/v1/images/generations` | POST | 图像生成 |
| `/v1/audio/speech` | POST | 语音合成 |
| `/v1/audio/transcriptions` | POST | 语音转文字 |
| `/v1/models` | GET | 模型列表 |
| `/v1/fine-tune/jobs` | POST/GET | 微调任务 |
| `/v1/files` | POST/GET | 文件管理 |

**对 Ultralisk 的意义**：
- **OpenAI 兼容是强制要求**——不是差异化，是门票
- Together AI 的主要价值不在 API 设计，而在**背后性能**
- Ultralisk 只需要实现 `/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/models` 就够 MVP

### 4.2 Chat Completions 参数

Together AI 支持的参数比 OpenAI 标准更多：

| 参数 | OpenAI | Together AI | Ultralisk 需要？ |
|------|--------|------------|-----------------|
| `model` | ✅ | ✅ | ✅ 必做 |
| `messages` | ✅ | ✅ | ✅ 必做 |
| `stream` | ✅ | ✅ | ✅ 必做 |
| `max_tokens` | ✅ | ✅ | ✅ 必做 |
| `temperature` | ✅ | ✅ | ✅ 必做 |
| `top_p` | ✅ | ✅ | ✅ 必做 |
| `stop` | ✅ | ✅ | ✅ 必做 |
| `frequency_penalty` | ✅ | ✅ | ✅ 必做 |
| `presence_penalty` | ✅ | ✅ | ✅ 必做 |
| `tools` / `tool_choice` | ✅ | ✅ | ⚠️ Phase 2 |
| `response_format` | ✅ json_object | ✅ | ⚠️ Phase 2 |
| `seed` | ✅ | ✅ | ⚠️ Phase 2 |
| `logprobs` | ✅ | ✅ | ❌ MVP 不做 |
| `safety_model` | ❌ | ✅ | ❌ 不做 |
| `logit_bias` | ✅ | ✅ | ❌ 不做 |
| `user` | ✅ | ✅ | ❌ 不做 |

### 4.3 模型目录结构

Together AI 的 200+ 模型按类别组织：

```
├── Meta
│   ├── Llama 3.1 8B Instruct
│   ├── Llama 3.1 70B Instruct
│   ├── Llama 3.3 70B Instruct Turbo (FP8)
│   ├── Llama 3.1 405B
│   └── Llama Guard 3
├── DeepSeek
│   ├── DeepSeek V4 Pro
│   ├── DeepSeek V3
│   └── DeepSeek Coder V2
├── Qwen
│   ├── Qwen 2.5 72B Instruct
│   ├── Qwen 2.5 32B Instruct
│   └── Qwen 2.5 Coder 32B
├── Mistral
│   ├── Mistral Large 2
│   └── Mixtral 8x22B
├── Google
│   └── Gemma 2 27B / 9B
├── Microsoft
│   └── Phi-3 / Phi-4
├── Nous Research
├── Nvidia
├── Upstage
├── ...（图像/视频/音频/代码模型）
└── Community Models（社区模型）
```

**对 Ultralisk 的关键启示**：
1. **200+ 模型不是目标**——Together AI 的核心用户只使用其中 10-20 个
2. 精选策略：选取每个类别最流行的 2-3 个模型
3. Ultralisk 的差异化是**支持客户私有模型**，而不是堆数量

---

## 五、商业模式解构

### 5.1 收入模型

Together AI 的 $1B 年化收入可以拆解：

```
$1B ARR 的构成（估算）：
├─ Serverless Inference (按 token)       $200-300M  ← 引流产品，薄利
├─ Batch Inference (50% 折扣)             $100-150M  ← 低成本产品
├─ Provisioned Throughput (PTU)           $300-400M  ← 利润中心
├─ Dedicated Endpoints (独享 GPU)        $150-200M  ← 高利润
├─ GPU Clusters (自助)                    $100-150M  ← 基础设施
└─ Fine-tuning / 其他                     $50-100M   ← 增值
```

**利润结构**：
```
Serverless:  毛利率 ~30%（GPU 成本高，价格竞争激烈）
PTU:         毛利率 ~50-60%（锁定客户，可预测）
Dedicated:   毛利率 ~60-70%（独享硬件，高溢价）
GPU Cluster: 毛利率 ~40-50%（接近裸金属）
Fine-tuning: 毛利率 ~50%（算力 + 服务）
```

### 5.2 客户获取模式

Together AI 的客户获取渠道：

| 渠道 | 占比（估）| 成本 | 适合 Ultralisk？ |
|------|---------|------|-----------------|
| 开发者口碑/社区 | 30% | 低 | ✅ **核心渠道** |
| 企业销售团队 | 40% | 高（$200-500K ACV 才有 ROI） | ⚠️ 规模化后做 |
| 合作伙伴/集成 | 15% | 中 | ✅ 可以探索 |
| 内容营销/SEO | 10% | 中 | ✅ 值得做 |
| 会议/活动 | 5% | 高 | ❌ 早期不做 |

**对 Ultralisk 的核心启示**：
- **开发者社区驱动**是成本最低的获客方式
- 开源 + 技术博客 + API 免费额度 = 早期获客三板斧
- 企业销售覆盖的事件点：**年客单价 > $50K 时才需要**

### 5.3 定价心理学

Together AI 的定价策略有一个精心设计的**心理锚点**：

```
Serverless 定价（高单价，按 token）
→ 客户觉得"按量付费灵活"
→ 对比 OpenAI 的价格做锚定
→ 高声望模型（DeepSeek V4 Pro）定高价，拉高感知价格

PTU 定价（$0.05/min，按时间）
→ 客户觉得"跟 Serverless 差不多的单价"
→ 但 PTU 利用率越高越划算
→ 鼓励客户持续使用

Dedicated 定价（$6.49/hr，按 GPU）
→ 客户觉得"比自己买卡便宜"
→ H100 采购价 ~$30K，3 年摊销 ~$1.14/hr
→ Together AI 的 $6.49/hr 含了 5x 溢价→ 利润空间大
```

---

## 六、Together AI 的开源资产

Together AI 在 GitHub（togethercomputer）上有 101 个仓库。以下是 Ultralisk 可以直接使用的：

| 开源项目 | 用途 | Ultralisk 可用性 |
|---------|------|-----------------|
| **FlashAttention (v1-v4)** | 高效注意力 CUDA Kernel | ✅ vLLM 已集成，直接收益 |
| **RedPajama-v2** | 30T token 数据集 | ✅ 如需要训练/微调 |
| **ThunderKittens** | CUDA Kernel DSL | ❌ 不需要（不写 Kernel）|
| **Together Recipes** | Notebooks 和示例 | ⚠️ 参考价值 |
| **Medusa** | 推测解码 | ✅ vLLM 可集成 |
| **KAI Scheduler** | GPU 调度器（Run:ai 开源版） | ✅ 可用于 GPU 调度 |
| **Llama Guard** | 内容安全 | ⚠️ 可选 |

**核心策略**：
> Together AI 的研究投入 → 开源 → 整个生态受益（含 Ultralisk）
> Ultralisk 的策略是：**站在这个生态的肩膀上，把工程做扎实**

---

## 七、Together AI 工程团队规模估算

基于公开信息，估算 Together AI 的团队结构：

```
总员工：200-300 人

研发（120-180 人）：
├── 推理引擎团队（30-50 人）
│   ├── CUDA Kernel（10-15 人）
│   ├── 推理调度（10-15 人）
│   └── 量化/压缩（5-10 人）
├── 研究团队（20-30 人）
│   ├── 架构研究（10-15 人）
│   ├── 推理研究（5-10 人）
│   └── Agent 研究（5-10 人）
├── 基础设施（20-30 人）
│   ├── GPU 集群运维（10-15 人）
│   ├── 网络/存储（5-10 人）
│   └── 安全/合规（5 人）
├── 平台工程（20-30 人）
│   ├── API 网关（5-10 人）
│   ├── 控制台（5-10 人）
│   └── 计费/计量（5-10 人）
└── MLOps/工具（10-15 人）

非研发（80-120 人）：
├── 销售/市场（40-60 人）
├── 客户成功（15-25 人）
├── 管理/行政（15-25 人）
└── 法务/合规（10 人）
```

**对 Ultralisk 的启示**：
- Ultralisk 不需要 200-300 人的规模
- **10-20 人工程团队**可以做出 MVP（利用开源方案）
- **30-50 人**可以达到生产级水平
- 关键在于**工程效率**，而不是团队规模

---

## 八、Together AI 的未来演进方向

### 8.1 产品方向（基于 2026 年公告）

1. **Fine-tuning 深化**：工具调用 + 推理（thinking tokens）+ 视觉语言模型
2. **RL API**：强化学习训练即服务
3. **Agent 基础设施**：ThunderAgent、ATLAS-2
4. **视频生成**：Seedance 2.0（4K 视频）
5. **全球扩张**：欧洲 2GW 数据中心

### 8.2 竞争压力点

1. **开源追赶**：vLLM 每 3-6 个月性能大幅提升，缩小与 TIE 2.0 差距
2. **价格战**：DeepInfra 持续降价，Together AI 利润受压
3. **大厂入场**：AWS/GCP/Azure 自研推理芯片，云厂商原生推理服务
4. **Neocloud 分流**：CoreWeave/Lambda 提供更便宜的纯 GPU

### 8.3 长期风险

1. **NVIDIA 做平台**：NVIDIA 可能直接提供推理 API（已投资 Together AI，但可能转向）
2. **芯片多元化**：AMD/Intel/定制芯片崛起，NVIDIA 生态护城河削弱
3. **模型变小变快**：小模型（8B/13B）能力提升，降低对 70B+ 大模型的需求

---

## 九、对 Ultralisk 的 10 条可操作洞察

### 工程层

1. **vLLM 是最佳起点**——Together AI 自研引擎证明极致性能可行，但 vLLM 已足够生产
2. **AWQ INT4 量化是 MVP 杀手功能**——显存省 4x，速度提升 30-50%
3. **FP8 是第二步**——H100 原生支持，同时跟进
4. **Medusa/推测解码是 Phase 2**——开源可集成，2x 加速
5. **GPU 利用率优化是长期壁垒**——Together AI 在这块没有特别强，Ultralisk 可以超越

### 产品层

6. **OpenAI 兼容 API 只是门票**——真正的差异化在性能、价格和私有化
7. **私有化部署是最大差异化**——Together AI 不做，也做不了
8. **模型精选 10-20 个**——不需要 200+，只需要每个场景最好的 2-3 个

### 商业层

9. **社区驱动获客**——技术博客 + 开源 + API 免费额度，成本远低于企业销售
10. **定价 30-50% 低于 Together AI**——因为没有研究成本和销售成本

### 终极判断

> **Together AI 的 $1B ARR、$8.3B 估值、200+ 员工证明了 AI Infra 市场的巨大空间。**
>
> **Ultralisk 的机会不在于复制 Together AI 的所有功能，而在于：**
> 1. **公有云 API：以 30-50% 更低价格提供 80% 的性能**
> 2. **私有化部署：做 Together AI 做不了的事**
> 3. **管控平台：让自建 GPU 的企业不再需要 Together AI**
>
> **三个产品线覆盖三个市场，而 Together AI 只能覆盖其中一个。**

---

*本文档基于 2026-07-09 的公开信息分析，数据来源包括 Together AI 官网、博客、Sacra 报告、第三方评测等。性能数据来自 Together AI 官方宣称，未独立验证。*

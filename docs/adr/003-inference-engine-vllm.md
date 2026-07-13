# ADR-003: 推理引擎 — vLLM 基线 + 自研路线

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-001（架构总览）

> **对象定位**: Zealot 引擎实现 Runtime ABI。它消费 ExecutionPlan，操作 Worker 和 ModelRevision，产出 InferenceSession 和 tokens。不是"用什么引擎"的技术选型，而是 Runtime ABI 的演进路线。

---

## Context

推理引擎是 Data Plane 的核心，负责将 AI 模型加载到 GPU 并对外提供 OpenAI 兼容的推理 API。核心需求：

1. **高吞吐**：最大化 GPU 利用率，降低单 token 成本
2. **低延迟**：首 token 延迟（TTFT）< 500ms，每 token 延迟（TPOT）< 50ms
3. **OpenAI 兼容 API**：客户端无需改代码
4. **多模型支持**：Llama、Qwen、DeepSeek 等主流开源模型
5. **量化支持**：AWQ INT4 / FP8 减少显存占用
6. **K8s 原生部署**：方便扩缩容和滚动更新

战略问题：直接用开源 vLLM，还是走自研路线？

Together AI 的案例：自研 TIE 引擎声称 4x 于开源 vLLM，核心优化包括 FlashAttention-4、自定义 speculative decoding、prefill-decode 分离。这给了 Together AI 定价和性能的双重护城河——竞争对手无法通过"也部署一个 vLLM"来追上。

---

## Decision

**Phase 1（第 1-3 月）**：直接使用开源 **vLLM** 作为推理引擎，不上自研。

**Phase 2（第 4-6 月）**：发布 Zealot 独立推理引擎，不经过 vLLM fork。Zealot 以独立进程运行，实现 Runtime Interface (gRPC)，直接替代 vLLM。Block Manager、Constrained Decode、Scheduler 全部 Rust native。

**Phase 3（第 7-12 月）**：Zealot 持续优化，性能达到 Together TIE 的 80%+，成为 Ultralisk 默认引擎。

```
Phase 1              Phase 2                    Phase 3
vLLM (vanilla)  →    Zealot (独立引擎)     →    Zealot 持续优化
─────                ──────                    ────
• 快速上线            • 独立进程，替代 vLLM       • 追平 Together TIE
• 社区跟进            • Rust Block Manager       • 定价护城河
• 验证产品            • Constrained Decode       • 5-8 引擎团队
• 0 引擎工程师        • CUDA kernel 优化
                     • 自定义量化
                     • 2-3 GPU 工程师
```

---

## Rationale

### 为什么 Phase 1 不直接自研

自研推理引擎需要 6-10 个 CUDA/C++ 工程师 6-12 个月才能产出可用版本。如果 Phase 1 就启动自研：
- **产品上市延迟 6 个月**：没有引擎 = 没有推理服务 = 没有客户
- **资源错配**：前 3 个月的核心任务是验证产品和获客，不是写 CUDA kernel
- **风险**：引擎做出来可能跟 vLLM 差不多（很多"自研引擎"最终只比开源快 10-20%）

### 为什么需要自研（而非永远用 vLLM）

只用 vLLM 意味着 Ultralisk 和任何竞争对手的推理成本基准完全相同。推理平台的核心成本是 GPU 时间，而 GPU 时间的利用率由引擎决定：

| 指标 | vLLM（vanilla） | Together AI TIE | 差距 |
|------|-----------------|-----------------|------|
| GPU 利用率 | 30-40% | 60-70% | **~2x** |
| 每 token 成本 | 基准 | 基准的 50-60% | **40-50% cheaper** |
| 单 GPU 吞吐 | 基准 | 2-4x | **定价护城河** |

不追这个差距，意味着竞争对手可以随时 **低于你的成本价** 定价，你无法反击。

### 自研什么，不做什么

参考 Together AI 的策略：**不自研全部，只优化关键路径**。

**做（高 ROI）：**

| 优化方向 | 预期提升 | 难度 | 参考 |
|---------|---------|------|------|
| FlashAttention 针对 H100/B200 架构优化 | 20-40% 吞吐 | ⭐⭐⭐⭐ | FA-3/FA-4 |
| 自定义量化（FP8/INT4 微调） | 2x 显存节省 → 更多并发 | ⭐⭐⭐ | AWQ → 定制 |
| Prefill-Decode 分离调度 | 30-50% GPU 利用率 | ⭐⭐⭐⭐ | CPD（Together） |
| Speculative Decoding 定制 | 1.5-2x 小模型 | ⭐⭐⭐ | Medusa/Eagle |
| Continuous Batching 公平性 | 尾延迟降低 | ⭐⭐ | 调度策略 |

**不做（低 ROI）：**

| 不做 | 原因 |
|------|------|
| 自研 attention kernel 从零写 | FlashAttention 已开源，调参即可 |
| 自研 tokenizer | 复用 HuggingFace |
| 完整替换推理栈 | vLLM 框架保留，只替换关键组件 |

### 技术路线

```
Phase 2：Zealot 独立引擎

Zealot Backend (Rust 进程, tonic gRPC)
    │
    ├── Runtime Interface 原生实现（替代 vLLM FastAPI Server）
    ├── Block Manager (Rust)
    ├── Constrained Decode (Rust)
    ├── Scheduler (Rust)
    ├── Attention Kernel (CUDA，改装自 FA-3)
    ├── Quantization Kernel (CUDA，per-layer mixed precision)
    │
    └── Model Loader (Python, HuggingFace)
        ↑ Rust 主进程通过 PyO3 嵌入 Python 解释器，仅用于加载权重。
          vLLM 代码零依赖——Model Loader 直接调 HuggingFace transformers。
```

核心原则：**自建而非 fork**。Zealot 不从 vLLM fork 启动，而是以独立进程构建。
Python 仅用于 HuggingFace Model Loader（永久需求），其余全部 Rust native。这样：
- 无 vLLM rebase 负担——不依赖 vLLM 代码库
- 优化自由度大——Scheduler、Block Manager、Attention 全部可控
- 团队规模可控——Phase 2 只需 2-3 人，Model Loader 复用 HuggingFace 生态

### SGLang 的角色

SGLang 在特定场景下超越 vLLM（RadixAttention 对前缀共享、structured generation）。自研引擎可以从 SGLang 也"借"一些想法：
- RadixAttention 的前缀树 → 借鉴到 Zealot 的 KV cache 管理
- xgrammar 的结构化生成 → 集成到 Zealot

SGLang 和 vLLM 都是**材料**，Zealot 是**成品**。

---

## Consequences

**正面：**
- Phase 1 快速上线验证产品（2 周）
- Phase 2 即交付独立 Zealot 引擎，可直接替换 vLLM
- Phase 3 自有引擎成为定价护城河

**负面：**
- Phase 2 起需要组建 GPU 工程团队（2-3 人起步，Phase 3 扩到 5-8 人）
- 自研引擎的测试和稳定性保障要求更高（无社区 QA）
- 端到端集成测试需要 GPU 环境（block manager 可在无 GPU 下单元测试）

**待跟进：**
- Phase 1 期间开始招聘 GPU/CUDA 工程师（提前储备，Phase 2 启动）
- 定义 Zealot 的性能基准和追赶目标（vs vLLM，vs Together TIE）

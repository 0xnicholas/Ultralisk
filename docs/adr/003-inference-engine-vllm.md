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

**Phase 2（第 4-6 月）**：启动自研，从 fork vLLM 开始，聚焦 GPU 利用率优化。

**Phase 3（第 7-12 月）**：发布 Ultralisk Inference Engine（Zealot），作为差异化竞争壁垒。

```
Phase 1              Phase 2                Phase 3
vLLM (vanilla)  →    vLLM fork + 优化  →    Zealot (自研引擎)
─────                ──────                ────
• 快速上线            • CUDA kernel 优化     • 完整自研栈
• 社区跟进            • 自定义量化           • 定价竞争力
• 验证产品            • attention 优化       • 护城河
• 0 引擎工程师        • 2-3 GPU 工程师      • 5-8 引擎团队
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
Phase 2 自研起点：

vLLM (upstream)
    │
    ├── 保持 API 兼容（OpenAI compatible server）
    ├── 保持模型加载逻辑（weight loader）
    │
    └── REPLACED:
        ├── Block Manager（Python → Rust，PagedAttention 算法保留，实现换 Rust ownership 保证安全）
        ├── Attention kernel（替换为针对性优化的 FA-kernel）
        ├── Quantization（替换为自定义量化方案）
        ├── Scheduler（替换为 Prefill-Decode 分离调度器）
        └── Speculative decoder（替换为定制 draft model）
```

核心原则：**fork 而非 rewrite**。vLLM 的模型加载、API 服务逻辑不动。只替换关键组件——Block Manager（Python→Rust）、GPU kernel 和调度逻辑。这样：
- 新模型发布时仍能快速支持（模型加载逻辑不变）
- 优化点聚焦在高 ROI 的 kernel 层
- 团队规模可控（不需要完整的引擎团队）

### SGLang 的角色

SGLang 在特定场景下超越 vLLM（RadixAttention 对前缀共享、structured generation）。自研引擎可以从 SGLang 也"借"一些想法：
- RadixAttention 的前缀树 → 借鉴到 Zealot 的 KV cache 管理
- xgrammar 的结构化生成 → 集成到 Zealot

SGLang 和 vLLM 都是**材料**，Zealot 是**成品**。

---

## Consequences

**正面：**
- Phase 1 快速上线验证产品（2 周）
- Phase 2 的优化可对标 Together AI 的性能差距
- Phase 3 自有引擎成为定价护城河

**负面：**
- Phase 2 起需要组建 GPU 工程团队（2-3 人起步，Phase 3 扩到 5-8 人）
- vLLM upstream 更新需要持续 rebase（维护 fork 的成本）
- 自研引擎的测试和稳定性保障要求更高
- **vLLM upstream rebase 维护策略**：随着 fork 深度增加，rebase 冲突会越来越严重。必须尽早定义节奏：
  - **Cadence**：每 2 周从 upstream main 拉取，评估冲突量。冲突 > 50 文件时暂停优化，专注 rebase。
  - **冲突处理**：Model Loader（Python，我们不动）→ 零冲突。Attention kernel（我们改装了）→ 手动冲突解决。Scheduler/Block Manager（我们替换为 Rust）→ 无冲突（已完全替换）。
  - **红线**：连续 2 次 rebase 间隔 > 1 个月 → 风险升级，优先处理。
  - **自动化**：CI pipeline 每日对比 fork vs upstream main 的 diff，报告冲突预判。

**待跟进：**
- Phase 1 期间开始招聘 GPU/CUDA 工程师（提前储备，Phase 2 启动）
- 定义 Zealot 的性能基准和追赶目标（vs vLLM，vs Together TIE）
- vLLM v1 重构完成后评估是否 fork v1 还是继续当前版本

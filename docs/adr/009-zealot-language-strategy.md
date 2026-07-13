# ADR-009: Zealot 推理引擎 — 语言栈与组件策略

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-003（推理引擎选型）

> **对象定位**: 本 ADR 定义 Runtime ABI 的实现策略——哪些用 Python（Model Loader，保持对象兼容性）、哪些用 Rust（Block Manager、Scheduler，操作 InferenceSession 和 Worker）、哪些用 CUDA（Kernel）。不是技术选型清单，是 Runtime ABI 的内部分工。

---

## Context

ADR-003 决定构建自研推理引擎 Zealot。这个决策留下了实现层面的问题：如何组织 Zealot 的代码？哪些用 Python、哪些用 Rust、哪些用 CUDA？

核心约束：
- Zealot 必须能快速支持新模型（vLLM 社区 1-2 周适配，我们不能比这个慢）
- 团队规模有限（Phase 2 时 2-3 人，Phase 3 时 5-8 人）
- 性能目标是 Phase 3 达到 Together TIE 的 80%+

---

## Decision

**Zealot = 组件级替换 vLLM，非全量重写**。

```
语言分工：

Python ──→ Model Loader + API Server      ← 保留 vLLM 原版，社区同步
Rust   ──→ Scheduler + Block Manager     ← 逐步替换
           + Constrained Decode Engine
CUDA   ──→ Attention Kernel + Quantization ← 改装优化，不重写
           + MLP + Sampling
```

**替换优先级**：

| 优先级 | 组件 | 语言 | Phase | 动机 |
|--------|------|------|-------|------|
| P0 | Attention Kernel | CUDA（改装） | 2 | 最大性能收益（20-40% 吞吐） |
| P0 | Quantization Kernel | CUDA（改装） | 2 | per-layer mixed precision |
| P1 | Block Manager (KV cache) | Rust | 2 | 消除 use-after-free 内存 bug |
| P1 | Constrained Decode | Rust | 2 | 对标 SGLang xgrammar（2-3x 加速） |
| P2 | Scheduler | Rust | 3 | 消除 GC tail latency |
| ❌ 不动 | Model Loader | Python | 永久 | 依赖 HF 生态，动了丢社区兼容性 |

---

## Rationale

### 为什么不全量 Rust 重写

一次 decode step 的耗时分解：

```
Scheduler 决策:    ~50μs   ← Python
Attention kernel: ~20ms   ← ████████████████████████ CUDA
MLP:               ~15ms   ← ██████████████████ CUDA
Sampling:          ~5μs    ← ▏ CUDA
```

Python 在整个延迟中占比不到 0.2%。用 Rust 重写 Python 部分，GPU 性能一毫秒都不会快。全量重写还会丢失 vLLM 社区对新模型的快速支持——Model Loader 的一致性是我们必须保留的。

### 为什么 Rust 替换 Block Manager

vLLM 的 PagedAttention 管理 GPU 显存分页。Python 里 block 的分配和释放是手动引用计数，无法在编译期保证安全。真实场景：

```
请求 A 正在用 block #42 → 请求 A 超时被 Python 取消
→ block #42 被释放 → 分配给请求 B
→ 但请求 A 的 CUDA kernel 还没跑完 → 读到请求 B 的 KV cache
```

这是跨请求的 use-after-free，Python 没有机制阻止。Rust 的 ownership 可以在编译期保证 block 不会被提前释放。

### 为什么 Rust 替换 Constrained Decode

当用户使用 `response_format: { "type": "json_object" }` 时，每次采样都要检查 token 是否符合 JSON schema。vLLM 用 `outlines` 库在 Python 里做，有 GIL 开销。SGLang 的 `xgrammar`（Rust）直接在 GPU 侧做约束，快 2-3 倍。

### 为什么 Phase 2 不动 Scheduler

Scheduler 的 Rust 重写的收益是消除 GC tail latency（P99 从几百 ms 降到均匀分布）。但 Phase 2 有更高 ROI 的事情（attention kernel、量化、Block Manager），Scheduler 留到 Phase 3。Phase 2 先用 vLLM 原有调度逻辑（Rust 重新实现接口等价）。

### Python ↔ Rust 的 FFI 方案

Zealot 是 Rust 主进程，Python 作为嵌入解释器运行——方向与前版设计相反。

**调用关系**：

```
Zealot Backend (Rust 进程, tonic gRPC)
    │
    │  PyO3 嵌入 CPython 解释器                                    │
    ├──────────────────────────────────────────────────────────────│
    │                                                              │
    ├── Block Manager (Rust native)                                │
    ├── Constrained Decode (Rust native)                          │
    ├── Scheduler (Rust native)                                   │
    ├── HTTP/gRPC Server (tonic)                                  │
    │                                                              │
    └── Model Loader ──── PyO3 ────► Python (HuggingFace)         │
        调用 safetensors/transformers 加载权重                     │
                                                                  │
    其余一切（推理调度、内存管理、API 服务）全部 Rust native。       │
    PyO3 仅用于 Model Loader，不参与 decode loop。                  │
```

- **Model Loader 为何保留 Python**：HuggingFace 生态全体在 Python，重写等于放弃整个模型生态
- **其余为何不用 Python**：任何在 decode loop 内的 Python 调用都会引入 GIL（参见 §5.3）

---

## Consequences

**正面：**
- Zealot 独立进程运行，零 vLLM 依赖（Model Loader 除外），无 fork rebase 负担
- Rust native 组件（Block Manager + Scheduler + Constrained Decode）无 GIL、无 GC tail latency
- Python 仅用于 Model Loader，不参与 decode loop 热路径

**负面：**
- 团队需要同时掌握 Python + Rust + CUDA 三套工具链
- Model Loader 依赖 PyO3 嵌入 Python，启动时需要初始化 CPython 解释器
- 端到端集成测试需要 GPU 环境（block manager 等纯 Rust 组件可无 GPU 单元测试）

**待跟进：**
- 定义 Rust Block Manager 的 API 边界（哪些数据结构跨越 FFI）
- 制定 Rust 代码的测试策略（单元测试 + property-based testing）
- PyO3 嵌入 Python 解释器的启动开销和内存占用

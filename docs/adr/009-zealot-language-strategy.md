# ADR-009: Zealot 推理引擎 — 语言栈与组件策略

**日期**: 2026-07-11  
**状态**: accepted  
**依赖**: ADR-000（Platform Object Model）、ADR-003（推理引擎选型）

> **对象定位**: 本 ADR 定义 Runtime ABI 的实现策略——哪些用 Python（Model Loader，保持对象兼容性）、哪些用 Rust（Block Manager、Scheduler，操作 InferenceSession 和 Worker）、哪些用 CUDA（Kernel）。不是技术选型清单，是 Runtime ABI 的内部分工。

---

## Context

ADR-003 决定从 vLLM fork 起步，自研推理引擎 Zealot。这个决策留下了实现层面的问题：如何组织 Zealot 的代码？哪些用 Python、哪些用 Rust、哪些用 CUDA？是全量重写 vLLM 还是组件级替换？

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
| P1 | Block Manager (KV cache) | Python → Rust | 2 | 消除 use-after-free 内存 bug |
| P1 | Constrained Decode | Python → Rust + GPU | 2 | 对标 SGLang xgrammar（2-3x 加速） |
| P2 | Scheduler | Python → Rust | 3 | 消除 GC tail latency |
| P2 | Tokenizer | Python FFI → Rust | 3 | 零拷贝 tokenization |
| ❌ 不动 | API Server (FastAPI) | Python | 永久 | 不是瓶颈，重写无收益 |
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

Scheduler 的 Rust 重写的收益是消除 GC tail latency（P99 从几百 ms 降到均匀分布）。但 Phase 2 有更高 ROI 的事情（attention kernel、量化），且 GC tail latency 的影响不如其他问题紧迫。留到 Phase 3。

### Python ↔ Rust 的 FFI 方案

Zealot 的 Rust 组件通过 PyO3 编译为 `.so`，由 Python 侧直接 import。vLLM 已有 C++ 扩展的先例（`vllm/_C.abi3.so`），机制相同。

**交付物**：单一二进制 `zealot_engine.abi3.so`。PyO3 的 `#[pyclass]` / `#[pymethods]` 直接生成 Python 可调用的类和方法，不需要中间适配代码。

**Phase 2 → Phase 3 的调用关系演进**：

```
Phase 2（fork vLLM，组件注入）：
  vLLM Python 代码
      │  import zealot_engine  ← 替换原有 Python 实现
      ▼
  zealot_engine.abi3.so        ← Block Manager / Constrained Decode (Rust)

  目的：在 vLLM 的 shell 内逐个替换组件，加速开发迭代。

Phase 3（Zealot 替代 vLLM）：
  Zealot Backend (Rust, tonic) ← 原生实现 Runtime Interface
      │
      ├── zealot_engine.abi3.so ← Block Manager + Scheduler (Rust)
      ├── Model Loader (Python) ← 永久保留，HF 生态兼容
      └── API Server (FastAPI)  ← 永久保留，OpenAI 协议兼容

  vLLM 的 fork 不再存在。API Server 和 Model Loader 是 Zealot 自己的
  Python 代码——它们曾经来自 vLLM，但现在是 Zealot 项目的一部分。
  组件注入（import 替换）是 Phase 2 的开发加速手段，不是终态架构。
```

---

## Consequences

**正面：**
- 组件替换而非全量重写，Phase 2 即可交付首个 Rust 组件（Block Manager）
- 与 vLLM upstream 保持 Model Loader 同步，新模型支持不丢失
- Rust 组件独立演进，替换粒度可控（先 Block Manager，后 Scheduler）

**负面：**
- Phase 2 期间 Python ↔ Rust FFI 引入序列化开销（PyO3 零拷贝可缓解）
- 团队需要同时掌握 Python + Rust + CUDA 三套工具链
- Phase 2 的 Rust Block Manager 和 Python Scheduler 交互边界需精心设计（Phase 3 Scheduler 转 Rust 后此问题消失）

**待跟进：**
- 定义 Rust Block Manager 的 API 边界（哪些数据结构跨越 FFI）
- 制定 Rust 代码的测试策略（单元测试 + property-based testing）
- 评估 PyO3 的 GIL 处理策略（Rust 代码是否需要释放 GIL 以允许 Python 并发）
- Phase 2→3 过渡策略：vLLM fork 的 API Server 和 Model Loader 何时脱离 fork、纳入 Zealot 自身仓库

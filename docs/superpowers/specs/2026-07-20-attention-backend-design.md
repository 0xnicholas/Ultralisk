# AttentionBackend: CUDA 集成框架设计

**日期**: 2026-07-20
**状态**: proposed
**依赖**: ADR-009 (Zealot Language Strategy), ADR-010 (Backend Runtime)

---

## 1. 目标

为 Zealot 引擎搭建可插拔的 Attention 计算后端框架。初期交付 `AttentionBackend` trait、`CpuAttention` 参考实现、`CudaAttention` stub（cudarc 集成），为未来 FA-3 CUDA kernel 预留接口。

## 2. 架构

```
Engine (Box<dyn ModelRunner>)
  │
  ├── PyModelRunner          ← 保留 (dev-mode PyTorch CPU, 调试用)
  └── CudaModelRunner        ← 新增
        │
        └── attention: Box<dyn AttentionBackend>
              ├── CpuAttention   ← naive O(n²), 测试 + 无 GPU 默认
              └── CudaAttention  ← #[cfg(feature = "cuda")], stub → 未来 FA-3 PTX
```

**关键设计约束**：
- `ModelRunner` trait 新增 `tokenize_chat` 方法签名，其余接口不变。
- `AttentionBackend` 是 `CudaModelRunner` 的内部组件，不暴露给 Engine。
- `CpuAttention` 的输出必须与 PyTorch CPU attention 在 `1e-5` 内对齐。
- CUDA 通过 `#[cfg(feature = "cuda")]` 条件编译，不影响无 GPU 环境下的构建和测试。
- `PyModelRunner` 保留：它是调试对照（"正确答案"），在 CI 中作为集成测试的基准。生产路径走 `CudaModelRunner`。

## 3. AttentionBackend trait

文件：`zealot/src/attention/mod.rs`

```rust
pub trait AttentionBackend: Send {
    fn forward(
        &mut self,
        query: &[f32],
        key: &[f32],
        value: &[f32],
        batch: &AttentionBatch,
    ) -> Result<Vec<f32>, ZealotError>;
}

pub struct AttentionBatch {
    pub num_seqs: usize,
    pub num_heads: usize,
    pub head_dim: usize,
    /// 本次 step 的有效 seq_len。Phase 1 仅支持同质 batch（全 prefill 或全 decode）：
    ///   - prefill batch: max_seq_len = prompt_len
    ///   - decode batch: max_seq_len = 1
    pub max_seq_len: usize,
}
```

> **Phase 1 限制**：不支持 prefill 和 decode 混合在一个 batch 中（虽然 Scheduler 已经返回混合 batch，但 `CudaModelRunner::step()` 会将它们拆分为两个独立的 `forward()` 调用：先处理 prefill，再处理 decode）。这样 `AttentionBatch` 中所有 sequence 长度相同，无需 `seq_lens` 字段。

- `query/key/value`: 扁平 `[f32]`，内存布局 `[num_seqs, num_heads, max_seq_len, head_dim]`。
- 返回值: 同布局的扁平浮点数组。

**错误处理**：维度不匹配 → `Err(ZealotError::Internal("dimension mismatch: expected X, got Y"))`。不得 panic。

## 4. CpuAttention

文件：`zealot/src/attention/mod.rs`

Naive O(n²) CPU attention 实现：

```
score    = Q_i @ K_i^T / sqrt(head_dim)
attn_w   = softmax(score)
output_i = attn_w @ V_i
```

用途：(1) 无 GPU 环境下的功能验证和单元测试；(2) 作为 CudaAttention 计算正确性的参考基线。

不做任何优化（无 tiling、无 flash attention 等效），仅确保结果正确。

## 5. CudaAttention stub

文件：`zealot/src/attention/cuda.rs`

```rust
#[cfg(feature = "cuda")]
pub struct CudaAttention {
    dev: cudarc::driver::CudaDevice,
    ptx_module: Option<cudarc::driver::CudaModule>,
}

#[cfg(feature = "cuda")]
impl AttentionBackend for CudaAttention {
    fn forward(&mut self, q: &[f32], k: &[f32], v: &[f32], batch: &AttentionBatch) -> Result<Vec<f32>, ZealotError> {
        // Phase 1: fallback to CpuAttention, log stub warning
        // Phase 2: load FA-3 PTX → copy tensor to device → launch → copy back
        tracing::warn!("CudaAttention stub active, falling back to CPU");
        CpuAttention.forward(q, k, v, batch)
    }
}
```

### Feature gate 设计

```toml
[dependencies]
cudarc = { version = "0.13", optional = true }

[features]
cuda = ["dep:cudarc"]
default = []
```

- `cargo build` / `cargo test` → `CpuAttention`，无需 CUDA toolkit。
- `cargo build --features cuda` → 启用 `CudaAttention` 编译路径，需要 CUDA toolkit。
- CI 在 linux runner 加 `cargo build --features cuda` 编译验证。

## 6. CudaModelRunner

文件：`zealot/src/model_runner_cuda.rs`

### 数据结构

```rust
/// 每个 sequence 的 per-layer KV cache。Phase 1 全量张量（后续迁移到 block-based 分页）。
struct KvCache {
    key: Vec<f32>,         // [num_layers, num_heads, past_seq_len, head_dim]
    value: Vec<f32>,       // [num_layers, num_heads, past_seq_len, head_dim]
    num_layers: usize,
    num_heads: usize,
    head_dim: usize,
}

pub struct CudaModelRunner {
    attn: Box<dyn AttentionBackend>,
    states: HashMap<String, KvCache>,

    // ─ PyO3 启动时加载的权重（进入 decode loop 后不做 Python 操作） ─
    tokenizer_py: Option<Py<PyAny>>,       // HuggingFace tokenizer (PyO3), used by tokenize_chat
    embedding: Vec<f32>,                   // [vocab_size, hidden_dim]
    q_proj: Vec<f32>,                      // [hidden_dim, num_heads * head_dim]
    k_proj: Vec<f32>,                      // 同上
    v_proj: Vec<f32>,                      // 同上
    attn_proj: Vec<f32>,                   // [num_heads * head_dim, hidden_dim]
    lm_head: Vec<f32>,                     // [hidden_dim, vocab_size]

    hidden_dim: usize,
    num_heads: usize,
    head_dim: usize,
    num_layers: usize,
    vocab_size: usize,
}
```

> 注：`KvCache` 与 `BlockManager` 的 GPU block 簿记独立并存。Phase 1 仅收集完整 K/V 张量，后续 paged attention 迁移时 `KvCache` 替换为 block table + `BlockHandle` 引用。

### 构造函数

```rust
impl CudaModelRunner {
    /// 轻量构造，不加载权重（用于单元测试）。
    pub fn new_cpu() -> Self {
        Self {
            attn: Box::new(CpuAttention),
            states: HashMap::new(),
            tokenizer_py: None,
            embedding: Vec::new(), q_proj: Vec::new(), k_proj: Vec::new(),
            v_proj: Vec::new(), attn_proj: Vec::new(), lm_head: Vec::new(),
            hidden_dim: 0, num_heads: 0, head_dim: 0, num_layers: 0, vocab_size: 0,
        }
    }

    /// 通过 PyO3 加载 HF 模型权重 + tokenizer。在阻塞线程中调用。
    pub fn load(model_id: &str) -> Result<Self, ZealotError> {
        // PyO3 加载 tokenizer（AutoTokenizer.from_pretrained）和模型权重
        // （AutoModelForCausalLM.from_pretrained → 逐层提取 embedding/Q/K/V/attn_proj/lm_head
        //  的 weight.data → 拷贝到 Rust Vec<f32>）
        // 加载完成后返回 Self { attn: Box::new(CpuAttention), ... }
        todo!()
    }

    #[cfg(feature = "cuda")]
    pub fn load_cuda(model_id: &str, device_id: usize) -> Result<Self, ZealotError> {
        let dev = cudarc::driver::CudaDevice::new(device_id)?;
        // 同级 load() 但使用 CudaAttention
        todo!()
    }
}
```

### tokenize_chat

```rust
impl ModelRunner for CudaModelRunner {
    fn tokenize_chat(&self, messages: &[(String, String)]) -> Result<Vec<i64>, ZealotError> {
        Python::with_gil(|py| -> Result<Vec<i64>, ZealotError> {
            let tokenizer = self.tokenizer_py
                .as_ref()
                .ok_or_else(|| ZealotError::Internal("tokenizer not loaded".into()))?
                .bind(py);
            // 同 PyModelRunner::tokenize_chat 的逻辑：apply_chat_template
            // 详见 zealot/src/model_runner_py.rs:91-125
            todo!()
        })
    }
}
```

### step() → forward() 桥接

`ModelRunner::step()` 接收 `&mut [&mut Sequence]`，`AttentionBackend::forward()` 需要扁平张量 + `AttentionBatch`。转换流程：

```
ModelRunner::step(&mut self, batch: &mut [&mut Sequence])
  │
  ├── 1. 按 prefill/decode 拆分 batch（Scheduler 输出的混合 batch）
  │       prefill_seqs: Vec<&mut Sequence>  (seq.is_prefill() == true)
  │       decode_seqs:  Vec<&mut Sequence>  (seq.is_prefill() == false)
  │
  ├── 2. 每组分别执行 step_sub(group, phase_label)：
  │        a. 收集 token IDs: seq.step_input() → [seq_len] (prefill: prompt; decode: 1)
  │        b. embedding_lookup(&self.embedding, token_ids) → [seq_len, hidden_dim]
  │        c. Q = matmul(embed_out, &self.q_proj) → 拆分 → [1, num_heads, seq_len, head_dim]
  │           K/V 同理
  │        d. 拼接 history: 如果 states 中已有 KV cache，将历史 K/V 与当前 K/V 沿 seq_len 维拼接
  │        e. 构造 AttentionBatch { num_seqs, num_heads, head_dim, max_seq_len }
  │        f. output = self.attn.forward(&q_all, &k_all, &v_all, &batch)?;
  │        g. 取最后位置: output[..., -1, :] (decode) 或 output (prefill, 保留完整)
  │        h. 更新 states: 将新的 k_all/v_all 存入 KvCache
  │        i. attn_proj = matmul(last_output, &self.attn_proj) → [1, hidden_dim]
  │        j. logits = matmul(attn_proj, &self.lm_head) → [1, vocab_size]
  │        k. 返回 StepOut { request_id, logits, token: None, text: None }
  │
  └── 3. 合并 prefill + decode 的 StepOut 列表返回
```

### Rust 侧矩阵乘法（matmul）

Phase 1 使用 naive CPU 实现（纯 Rust `for` 循环，无 BLAS）：

```rust
/// C = A @ B   where A: [M, K], B: [K, N] (row-major, flat Vec<f32>)
fn matmul(a: &[f32], b: &[f32], m: usize, k: usize, n: usize) -> Vec<f32> {
    let mut c = vec![0.0_f32; m * n];
    for i in 0..m { for j in 0..n { for inner in 0..k {
        c[i * n + j] += a[i * k + inner] * b[inner * n + j];
    }}}
    c
}
```

> 未来用 BLIS/OpenBLAS 的 Rust binding 或 CUDA cublas 替换。Phase 1 仅验证形状正确性，不追求性能。

## 7. Engine 集成改动

### ModelRunner trait 扩展

```rust
pub trait ModelRunner: Send {
    fn step(&mut self, batch: &mut [&mut Sequence]) -> Result<Vec<StepOut>, ZealotError>;
    fn drop_state(&mut self, _request_id: &str) {}
    fn tokenize_chat(&self, messages: &[(String, String)]) -> Result<Vec<i64>, ZealotError> {
        let _ = messages;
        Err(ZealotError::Internal("tokenize_chat not implemented for this runner".into()))
    }

    /// EOS token ID（用于停止检测）默认 None。
    fn eos_token_id(&self) -> Option<i64> { None }
}
```

### Engine de-genericize

```rust
// Before
pub struct Engine<R: ModelRunner> { runner: R, ... }

// After
pub struct Engine {
    runner: Box<dyn ModelRunner>,
    sched: Scheduler,
    sampler: Sampler,
    rng: StdRng,
    tokenizer: Option<Tokenizer>,
}
```

Engine 的所有方法签名同步更新：`Engine<R>` → `Engine`，`R` 泛型参数移除。

### Engine 测试更新

现有测试（`engine.rs` test module）需要将 `Engine::new(sched, ScriptRunner{...})` 更新为 `Engine::new(sched, Box::new(ScriptRunner{...}))`。测试逻辑不变。

### zealot-backend.rs 重构清单

涉及以下位置的变更：
- **行 94 / 145**: `Engine<PyModelRunner>` → `Engine`
- **行 109-110**: `engine.runner().tokenize_chat(&messages)` — 现在通过 trait 方法调用，无需变更
- **行 282**: 启动选择逻辑（见下方）
- **行 295**: `runner.eos_token_id()` — 现为 trait 方法，无需变更。`CudaModelRunner` 在 `load()` 中从 tokenizer 提取 `eos_token_id` 并覆盖默认实现
- **行 282** 启动选择逻辑：
  ```rust
  #[cfg(feature = "cuda")]
  let runner: Box<dyn ModelRunner> = Box::new(CudaModelRunner::load_cuda(&model_id, 0)?);

  #[cfg(not(feature = "cuda"))]
  let runner: Box<dyn ModelRunner> = CudaModelRunner::load(&model_id).map(Box::new)?;
  ```

`PyModelRunner` 保留为可用模块（`pub`），但 zealot-backend 默认使用 `CudaModelRunner`。调试时可通过环境变量切换：
```rust
let runner: Box<dyn ModelRunner> = if std::env::var("ZEALOT_USE_PYTHON").is_ok() {
    Box::new(PyModelRunner::load(&model_id)?)
} else {
    // ... 同上选择逻辑
};
```

### lib.rs 声明

```rust
pub mod attention;
pub mod model_runner_cuda;
```

## 8. 文件结构

```
zealot/src/
  ├── attention/
  │   ├── mod.rs           ← AttentionBackend trait + AttentionBatch + CpuAttention + matmul 工具
  │   └── cuda.rs          ← CudaAttention #[cfg(feature = "cuda")]
  ├── model_runner_cuda.rs ← CudaModelRunner + KvCache
  ├── model_runner_py.rs   ← 不变
  ├── engine.rs            ← Engine 去泛型化 + trait 扩展 tokenize_chat
  ├── lib.rs               ← + pub mod attention; + pub mod model_runner_cuda;
  ├── scheduler.rs         ← 不变
  ├── block_manager.rs     ← 不变
  ├── sampling.rs          ← 不变
  ├── tokenizer.rs         ← 不变
  └── ...
```

## 9. 测试策略

| 层级 | 内容 | 验证点 | 命令 |
|------|------|--------|------|
| **Unit** | `CpuAttention::forward()` 与 PyTorch CPU attention 输出对齐 | 数值误差 < 1e-5 | `cargo test` |
| **Unit** | `CudaModelRunner` + `CpuAttention`，传入 dummy 权重，验证 `step()` 形状正确 | logits 形状 = [batch, vocab_size] | `cargo test` |
| **Unit** | Engine 现有 5 个测试（finishes_on_max_tokens, finishes_early_on_eos, batches_multiple_sequences, cancel_running_seq, engine_samples_from_logits）全部通过 | 与改动前相同 | `cargo test` |
| **编译** | `--features cuda` 下 CudaAttention 编译、cudarc 链接 | CI linux | `cargo build --features cuda` |
| **回归** | 现有所有测试无回归 | `cargo test` 零失败 | `cargo test` |

## 10. 不在范围内的内容

- 真实的 CUDA attention kernel 实现（FlashAttention-3、FA-3 PTX 编译）
- QuantBackend、RotaryBackend 等 companion trait
- FFN、RMSNorm 等 Transformer 层（CudaModelRunner 跳过这些层，logits 精度低但对测试足够）
- 权重加载与管理的纯 Rust 实现（load() 仍用 PyO3）
- CpuAttention 性能优化（BLAS/batching）
- Chunked prefill、Prefill-Decode disaggregation（单独的设计文档）

## 11. 验收标准

1. `CpuAttention` 通过 PyTorch 对齐测试（固定输入，输出误差 < 1e-5）。
2. `CudaModelRunner` 实现 `ModelRunner` trait，`load()` 通过 PyO3 加载权重，`step()` 返回真实 logits。
3. Engine 去泛型化后，现有 5 个 Engine 单元测试全部通过。
4. `--features cuda` 编译通过（linux CI）。
5. 无 CUDA 环境 `cargo build && cargo test` 全部通过（现有全部测试无回归）。
6. `PyModelRunner` 保留可用（`ZEALOT_USE_PYTHON=1` 可切换）。

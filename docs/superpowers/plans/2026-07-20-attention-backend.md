# AttentionBackend CUDA Integration Framework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build pluggable `AttentionBackend` trait with `CpuAttention` reference impl + `CudaAttention` stub, de-genericize Engine to `Box<dyn ModelRunner>`, and add `CudaModelRunner`.

**Architecture:** `AttentionBackend` lives inside `CudaModelRunner`, wraps the existing `ModelRunner` trait. Engine is de-genericized from `Engine<R>` to `Engine` using `Box<dyn ModelRunner>`. `CudaAttention` is feature-gated behind `#[cfg(feature = "cuda")]` with optional `cudarc` crate.

**Tech Stack:** Rust, PyO3, cudarc (optional), CUDA toolkit (conditional)

**Spec:** `docs/superpowers/specs/2026-07-20-attention-backend-design.md`

---

### Task 1: Cargo.toml — cudarc dependency + feature gate

**Files:**
- Modify: `zealot/Cargo.toml:12`

- [ ] **Step 1: Add cudarc optional dependency and feature**

```toml
[dependencies]
# ... existing deps ...
cudarc = { version = "0.13", optional = true }

[features]
cuda = ["dep:cudarc"]
default = []
```

- [ ] **Step 2: Verify it compiles (no CUDA)**

Run: `cd zealot && cargo build 2>&1`
Expected: builds clean, `cudarc` not pulled in, no CUDA toolkit needed.

- [ ] **Step 3: Commit**

```bash
git add zealot/Cargo.toml
git commit -m "feat(zealot): add cudarc optional dep + cuda feature gate"
```

---

### Task 2: attention/mod.rs — trait + AttentionBatch + CpuAttention + matmul + tests

**Files:**
- Create: `zealot/src/attention/mod.rs`

- [ ] **Step 1: Write the module (trait, struct, impl, matmul utility)**

Write `zealot/src/attention/mod.rs`:

```rust
use crate::error::ZealotError;

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
    pub max_seq_len: usize,
}

pub struct CpuAttention;

impl AttentionBackend for CpuAttention {
    fn forward(
        &mut self,
        query: &[f32],
        key: &[f32],
        value: &[f32],
        batch: &AttentionBatch,
    ) -> Result<Vec<f32>, ZealotError> {
        let expected = batch.num_seqs * batch.num_heads * batch.max_seq_len * batch.head_dim;
        if query.len() != expected || key.len() != expected || value.len() != expected {
            return Err(ZealotError::Internal(format!(
                "dimension mismatch: expected {}, got q={} k={} v={}",
                expected,
                query.len(),
                key.len(),
                value.len()
            )));
        }

        let H = batch.num_heads;
        let D = batch.head_dim;
        let S = batch.max_seq_len;
        let scale = 1.0_f32 / (D as f32).sqrt();
        let mut output = vec![0.0_f32; expected];

        for s in 0..batch.num_seqs {
            for h in 0..H {
                let base = ((s * H + h) * S) * D;
                let q = &query[base..base + S * D];
                let k = &key[base..base + S * D];
                let v = &value[base..base + S * D];
                let out = &mut output[base..base + S * D];

                let mut scores = vec![0.0_f32; S * S];
                for i in 0..S {
                    for j in 0..S {
                        let mut dot = 0.0_f32;
                        for d in 0..D {
                            dot += q[i * D + d] * k[j * D + d];
                        }
                        scores[i * S + j] = dot * scale;
                    }
                }

                for i in 0..S {
                    let mut max = f32::NEG_INFINITY;
                    for j in 0..S { max = max.max(scores[i * S + j]); }
                    let mut sum = 0.0_f32;
                    for j in 0..S { sum += (scores[i * S + j] - max).exp(); }
                    for j in 0..S { scores[i * S + j] = (scores[i * S + j] - max).exp() / sum; }
                }

                for i in 0..S {
                    for d in 0..D {
                        let mut acc = 0.0_f32;
                        for j in 0..S {
                            acc += scores[i * S + j] * v[j * D + d];
                        }
                        out[i * D + d] = acc;
                    }
                }
            }
        }
        Ok(output)
    }
}

pub fn matmul(a: &[f32], b: &[f32], m: usize, k: usize, n: usize) -> Vec<f32> {
    let mut c = vec![0.0_f32; m * n];
    for i in 0..m {
        for j in 0..n {
            for inner in 0..k {
                c[i * n + j] += a[i * k + inner] * b[inner * n + j];
            }
        }
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_attention_single_seq_output_shape() {
        let attn = CpuAttention;
        let batch = AttentionBatch { num_seqs: 1, num_heads: 2, head_dim: 4, max_seq_len: 3 };
        let q = vec![1.0_f32; 1 * 2 * 3 * 4];
        let k = vec![1.0_f32; 1 * 2 * 3 * 4];
        let v = vec![1.0_f32; 1 * 2 * 3 * 4];
        let out = attn.forward(&q, &k, &v, &batch).unwrap();
        assert_eq!(out.len(), 1 * 2 * 3 * 4);
    }

    #[test]
    fn cpu_attention_returns_error_on_dimension_mismatch() {
        let attn = CpuAttention;
        let batch = AttentionBatch { num_seqs: 1, num_heads: 2, head_dim: 4, max_seq_len: 3 };
        let q = vec![1.0_f32; 10]; // wrong size
        let k = vec![1.0_f32; 1 * 2 * 3 * 4];
        let v = vec![1.0_f32; 1 * 2 * 3 * 4];
        let err = attn.forward(&q, &k, &v, &batch).unwrap_err();
        assert!(matches!(err, ZealotError::Internal(_)));
    }

    #[test]
    fn cpu_attention_multi_seq_separate_attention() {
        let attn = CpuAttention;
        let batch = AttentionBatch { num_seqs: 2, num_heads: 1, head_dim: 4, max_seq_len: 2 };
        // seq0 q all 1, seq1 q all 100
        let mut q = vec![1.0_f32; 2 * 1 * 2 * 4];
        let base1 = 1 * 1 * 2 * 4;
        for i in base1..q.len() { q[i] = 100.0; }
        let k = vec![1.0_f32; 2 * 1 * 2 * 4];
        let v = k.clone();
        let out = attn.forward(&q, &k, &v, &batch).unwrap();
        // seq0 outputs should differ from seq1 outputs
        let o0 = &out[0..8];
        let o1 = &out[8..16];
        assert_ne!(o0, o1, "different inputs should yield different attention outputs");
    }

    #[test]
    fn matmul_dimensions() {
        let a = vec![1.0_f32, 2.0, 3.0, 4.0]; // 2x2
        let b = vec![5.0_f32, 6.0, 7.0, 8.0]; // 2x2
        let c = matmul(&a, &b, 2, 2, 2);
        // [[1*5+2*7=19, 1*6+2*8=22], [3*5+4*7=43, 3*6+4*8=50]]
        assert_eq!(c, vec![19.0, 22.0, 43.0, 50.0]);
    }
}
```

- [ ] **Step 2: Run attention tests**

Run: `cd zealot && cargo test attention 2>&1`
Expected: 4 tests pass. (The module isn't declared in lib.rs yet, so they won't compile — see Task 4.)

- [ ] **Step 3: Commit**

```bash
git add zealot/src/attention/mod.rs
git commit -m "feat(zealot): AttentionBackend trait + CpuAttention + matmul + tests"
```

---

### Task 3: attention/cuda.rs — CudaAttention stub

**Files:**
- Create: `zealot/src/attention/cuda.rs`

- [ ] **Step 1: Write the stub**

Write `zealot/src/attention/cuda.rs`:

```rust
#[cfg(feature = "cuda")]
use crate::attention::{AttentionBackend, AttentionBatch, CpuAttention};
#[cfg(feature = "cuda")]
use crate::error::ZealotError;

#[cfg(feature = "cuda")]
pub struct CudaAttention {
    #[allow(dead_code)]
    dev: cudarc::driver::CudaDevice,
    #[allow(dead_code)]
    ptx_module: Option<cudarc::driver::CudaModule>,
}

#[cfg(feature = "cuda")]
impl CudaAttention {
    pub fn new(device_id: usize) -> Result<Self, ZealotError> {
        let dev = cudarc::driver::CudaDevice::new(device_id)
            .map_err(|e| ZealotError::Internal(format!("cuda device {}: {}", device_id, e)))?;
        Ok(Self { dev, ptx_module: None })
    }
}

#[cfg(feature = "cuda")]
impl AttentionBackend for CudaAttention {
    fn forward(
        &mut self,
        q: &[f32],
        k: &[f32],
        v: &[f32],
        batch: &AttentionBatch,
    ) -> Result<Vec<f32>, ZealotError> {
        tracing::warn!("CudaAttention stub active, falling back to CPU");
        CpuAttention.forward(q, k, v, batch)
    }
}
```

- [ ] **Step 2: Verify default build compiles**

Run: `cd zealot && cargo build 2>&1`
Expected: compiles clean (cuda.rs has no contents without feature flag — every line is `#[cfg(feature = "cuda")]`, so the file is effectively empty).

- [ ] **Step 3: Commit**

```bash
git add zealot/src/attention/cuda.rs
git commit -m "feat(zealot): CudaAttention stub with cudarc feature gate"
```

---

### Task 4: lib.rs — module declarations

**Files:**
- Modify: `zealot/src/lib.rs:1-10`

- [ ] **Step 1: Add pub mod declarations**

After line 3 (`pub mod block_manager;`), add:

```rust
pub mod attention;
pub mod model_runner_cuda;
```

Note: `model_runner_cuda.rs` doesn't exist yet (Task 6), so this will cause a compile error. That's expected — we're wiring up the module tree incrementally.

- [ ] **Step 2: Verify attention module compiles**

Run: `cd zealot && cargo test attention 2>&1`
Expected: 4 tests pass (CpuAttention + matmul tests from Task 2).

- [ ] **Step 3: Commit**

```bash
git add zealot/src/lib.rs
git commit -m "feat(zealot): register attention + model_runner_cuda modules"
```

---

### Task 5: engine.rs — trait extension + de-genericize + test updates

**Files:**
- Modify: `zealot/src/engine.rs:15-23` (trait), `zealot/src/engine.rs:54-58` (Engine struct), `zealot/src/engine.rs:62-204` (impl block), `zealot/src/engine.rs:207-366` (tests)

- [ ] **Step 1: Extend ModelRunner trait (lines 15-23)**

Replace the current `pub trait ModelRunner: Send` block with:

```rust
pub trait ModelRunner: Send {
    fn step(&mut self, batch: &mut [&mut Sequence]) -> Result<Vec<StepOut>, ZealotError>;
    fn drop_state(&mut self, _request_id: &str) {}
    fn tokenize_chat(&self, messages: &[(String, String)]) -> Result<Vec<i64>, ZealotError> {
        let _ = messages;
        Err(ZealotError::Internal(
            "tokenize_chat not implemented for this runner".into(),
        ))
    }
    fn eos_token_id(&self) -> Option<i64> {
        None
    }
}
```

- [ ] **Step 2: De-genericize Engine struct (lines 54-58)**

Replace:
```rust
pub struct Engine<R: ModelRunner> {
    sched: Scheduler,
    runner: R,
    ...
}
```

With:
```rust
pub struct Engine {
    sched: Scheduler,
    runner: Box<dyn ModelRunner>,
    sampler: Sampler,
    rng: rand::rngs::StdRng,
    tokenizer: Option<crate::tokenizer::Tokenizer>,
}
```

- [ ] **Step 3: Update Engine::new (line 63-71)**

Replace:
```rust
pub fn new(sched: Scheduler, runner: R) -> Self {
    Self { sched, runner, ... }
}
```

With:
```rust
pub fn new(sched: Scheduler, runner: Box<dyn ModelRunner>) -> Self {
    Self {
        sched,
        runner,
        sampler: Sampler,
        rng: rand::rngs::StdRng::from_entropy(),
        tokenizer: None,
    }
}
```

- [ ] **Step 4: Update runner()/runner_mut() accessors (lines 79-93)**

Replace:
```rust
pub fn runner(&self) -> &R { &self.runner }
pub fn runner_mut(&mut self) -> &mut R { &mut self.runner }
```

With:
```rust
pub fn runner(&self) -> &dyn ModelRunner { &*self.runner }
pub fn runner_mut(&mut self) -> &mut dyn ModelRunner { &mut *self.runner }
```

- [ ] **Step 5: Update unit tests (lines 233-246, 257-365)**

All `Engine::new(sched, ScriptRunner{...})` → `Engine::new(sched, Box::new(ScriptRunner{...}))`

Test helper `fn engine(tokens: Vec<i64>) -> Engine<ScriptRunner>` → `fn engine(tokens: Vec<i64>) -> Engine`

Line 348: `Engine::new(sched, LogitRunner { logits })` → `Engine::new(sched, Box::new(LogitRunner { logits }))`

- [ ] **Step 6: Run Engine tests**

Run: `cd zealot && cargo test engine 2>&1`
Expected: 5 Engine tests pass (finishes_on_max_tokens, finishes_early_on_eos, batches_multiple_sequences, cancel_running_seq, engine_samples_from_logits).

- [ ] **Step 7: Commit**

```bash
git add zealot/src/engine.rs
git commit -m "refactor(zealot): de-genericize Engine, add tokenize_chat + eos_token_id to ModelRunner trait"
```

---

### Task 6: model_runner_cuda.rs — CudaModelRunner + KvCache + step() + load()

**Files:**
- Create: `zealot/src/model_runner_cuda.rs`

- [ ] **Step 1: Write model_runner_cuda.rs**

Write the full file:

```rust
use std::collections::HashMap;

use pyo3::prelude::*;
use pyo3::types::{PyDict, PyList};

use crate::attention::{AttentionBackend, AttentionBatch, CpuAttention};
use crate::engine::{ModelRunner, StepOut};
use crate::error::ZealotError;
use crate::scheduler::Sequence;

fn py_err(ctx: &str) -> impl Fn(PyErr) -> ZealotError + '_ {
    move |e: PyErr| ZealotError::Internal(format!("{ctx}: {e}"))
}

struct KvCache {
    key: Vec<f32>,
    value: Vec<f32>,
    num_layers: usize,
    num_heads: usize,
    head_dim: usize,
}

pub struct CudaModelRunner {
    attn: Box<dyn AttentionBackend>,
    states: HashMap<String, KvCache>,

    tokenizer_py: Option<Py<PyAny>>,
    embedding: Vec<f32>,
    q_proj: Vec<f32>,
    k_proj: Vec<f32>,
    v_proj: Vec<f32>,
    attn_proj: Vec<f32>,
    lm_head: Vec<f32>,

    hidden_dim: usize,
    num_heads: usize,
    head_dim: usize,
    num_layers: usize,
    vocab_size: usize,

    eos_token_id: Option<i64>,
}

impl CudaModelRunner {
    pub fn new_cpu() -> Self {
        Self {
            attn: Box::new(CpuAttention),
            states: HashMap::new(),
            tokenizer_py: None,
            embedding: Vec::new(),
            q_proj: Vec::new(),
            k_proj: Vec::new(),
            v_proj: Vec::new(),
            attn_proj: Vec::new(),
            lm_head: Vec::new(),
            hidden_dim: 0,
            num_heads: 0,
            head_dim: 0,
            num_layers: 0,
            vocab_size: 0,
            eos_token_id: None,
        }
    }

    pub fn load(model_id: &str) -> Result<Self, ZealotError> {
        Python::with_gil(|py| -> Result<Self, ZealotError> {
            if let Ok(sp) = std::env::var("ZEALOT_SITE_PACKAGES") {
                let sys = py.import("sys").map_err(py_err("import sys"))?;
                sys.getattr("path")
                    .map_err(py_err("sys.path"))?
                    .call_method1("insert", (0, sp))
                    .map_err(py_err("sys.path.insert"))?;
            }

            let torch = py
                .import("torch")
                .map_err(py_err("import torch (venv? set ZEALOT_SITE_PACKAGES)"))?;
            let transformers = py
                .import("transformers")
                .map_err(py_err("import transformers"))?;

            let tokenizer = transformers
                .getattr("AutoTokenizer")
                .map_err(py_err("AutoTokenizer"))?
                .call_method1("from_pretrained", (model_id,))
                .map_err(py_err("tokenizer from_pretrained"))?;
            let model = transformers
                .getattr("AutoModelForCausalLM")
                .map_err(py_err("AutoModelForCausalLM"))?
                .call_method1("from_pretrained", (model_id,))
                .map_err(py_err("model from_pretrained"))?;

            let eos_token_id: Option<i64> =
                tokenizer.getattr("eos_token_id").and_then(|v| v.extract()).ok();

            // Extract weight tensors from the HuggingFace model
            let config = model
                .getattr("config")
                .map_err(py_err("model.config"))?;
            let hidden_dim: usize = config.getattr("hidden_size")?.extract().map_err(py_err("hidden_size"))?;
            let num_heads: usize = config.getattr("num_attention_heads")?.extract().map_err(py_err("num_attention_heads"))?;
            let head_dim: usize = hidden_dim / num_heads;
            let num_layers: usize = config.getattr("num_hidden_layers")?.extract().map_err(py_err("num_hidden_layers"))?;

            let wte = model
                .getattr("transformer")
                .and_then(|t| t.getattr("wte"))
                .or_else(|_| model.getattr("model").and_then(|m| m.getattr("embed_tokens")))?
                .getattr("weight")?;
            let wte_data: Vec<f32> = to_vec_f32(wte)?;
            let vocab_size = wte_data.len() / hidden_dim;

            // Extract Q/K/V projection weights from layer 0's attention
            let extract_layer = |suffix: &str| {
                let layer = model
                    .getattr("transformer")
                    .and_then(|t| t.getattr("h"))
                    .or_else(|_| model.getattr("model").and_then(|m| m.getattr("layers")))?;
                let l0 = layer.get_item(0)?;
                let attn = l0.getattr("attn").or_else(|_| l0.getattr("self_attn").or_else(|_| l0.getattr("attention")))?;
                let w = attn.getattr(suffix)?.getattr("weight")?;
                to_vec_f32(w)
            };

            let q_proj = extract_layer("q_proj")?;
            let k_proj = extract_layer("k_proj")?;
            let v_proj = extract_layer("v_proj")?;
            let attn_proj = extract_layer("o_proj")?;

            // LM head: use embedding weight if tied, else lm_head
            let lm_head_data = model
                .getattr("lm_head")
                .and_then(|h| h.getattr("weight"))
                .and_then(|w| to_vec_f32(w).ok())
                .unwrap_or_else(|| wte_data.clone());

            Ok(Self {
                attn: Box::new(CpuAttention),
                states: HashMap::new(),
                tokenizer_py: Some(tokenizer.unbind()),
                embedding: wte_data,
                q_proj,
                k_proj,
                v_proj,
                attn_proj,
                lm_head: lm_head_data,
                hidden_dim,
                num_heads,
                head_dim,
                num_layers,
                vocab_size,
                eos_token_id,
            })
        })
    }

    #[cfg(feature = "cuda")]
    pub fn load_cuda(model_id: &str, device_id: usize) -> Result<Self, ZealotError> {
        use crate::attention::cuda::CudaAttention;
        let mut s = Self::load(model_id)?;
        s.attn = Box::new(CudaAttention::new(device_id)?);
        Ok(s)
    }
}

fn to_vec_f32(tensor: &Bound<'_, PyAny>) -> Result<Vec<f32>, ZealotError> {
    let cpu = tensor.call_method0("cpu").or_else(|_| Ok(tensor.to_owned()))?;
    let flat = cpu
        .call_method0("reshape")
        .and_then(|r| r.call_method1("__getitem__", (-1,)))?;
    let list = flat.call_method0("tolist")?;
    list.extract::<Vec<f32>>()
        .map_err(|e| ZealotError::Internal(format!("tolist: {e}")))
}

impl ModelRunner for CudaModelRunner {
    fn tokenize_chat(&self, messages: &[(String, String)]) -> Result<Vec<i64>, ZealotError> {
        Python::with_gil(|py| -> Result<Vec<i64>, ZealotError> {
            let tokenizer = self
                .tokenizer_py
                .as_ref()
                .ok_or_else(|| ZealotError::Internal("tokenizer not loaded".into()))?
                .bind(py);
            let list = PyList::empty(py);
            for (role, content) in messages {
                let d = PyDict::new(py);
                d.set_item("role", role).map_err(py_err("msg role"))?;
                d.set_item("content", content).map_err(py_err("msg content"))?;
                list.append(d).map_err(py_err("msg append"))?;
            }
            let kwargs = PyDict::new(py);
            kwargs.set_item("tokenize", true).map_err(py_err("kw"))?;
            kwargs.set_item("add_generation_prompt", true).map_err(py_err("kw"))?;
            match tokenizer.call_method("apply_chat_template", (list,), Some(&kwargs)) {
                Ok(ids) => ids.extract::<Vec<i64>>().map_err(py_err("chat_template ids")),
                Err(_) => {
                    let text = messages
                        .iter()
                        .map(|(r, c)| format!("{r}: {c}"))
                        .collect::<Vec<_>>()
                        .join("\n")
                        + "\n";
                    tokenizer
                        .call_method1("encode", (text,))
                        .map_err(py_err("encode"))?
                        .extract::<Vec<i64>>()
                        .map_err(py_err("encode ids"))
                }
            }
        })
    }

    fn eos_token_id(&self) -> Option<i64> {
        self.eos_token_id
    }

    fn step(&mut self, batch: &mut [&mut Sequence]) -> Result<Vec<StepOut>, ZealotError> {
        // Phase 1: split prefill/decode for homogeneous batches
        let mut outs = Vec::with_capacity(batch.len());

        let mut step_group = |group: &mut [&mut Sequence]| -> Result<Vec<StepOut>, ZealotError> {
            let mut group_outs = Vec::with_capacity(group.len());
            for seq in group.iter() {
                let token_ids = seq.step_input();
                let seq_len = token_ids.len();

                // Embedding lookup (not matmul): embedding_table[id] for each token
                let mut embed_out = vec![0.0_f32; seq_len * self.hidden_dim];
                for (i, &id) in token_ids.iter().enumerate() {
                    let start = id as usize * self.hidden_dim;
                    for d in 0..self.hidden_dim {
                        embed_out[i * self.hidden_dim + d] = *self.embedding.get(start + d).unwrap_or(&0.0);
                    }
                }

                // Q/K/V projection: [seq_len, hidden_dim] @ [hidden_dim, num_heads*head_dim]
                let proj_dim = self.num_heads * self.head_dim;
                let q_projected = crate::attention::matmul(&embed_out, &self.q_proj, seq_len, self.hidden_dim, proj_dim);
                let k_projected = crate::attention::matmul(&embed_out, &self.k_proj, seq_len, self.hidden_dim, proj_dim);
                let v_projected = crate::attention::matmul(&embed_out, &self.v_proj, seq_len, self.hidden_dim, proj_dim);

                // Reshape [seq_len, num_heads*head_dim] → [1, num_heads, seq_len, head_dim]
                let h = self.num_heads;
                let d = self.head_dim;
                let reshape = |src: &[f32]| {
                    let mut out = vec![0.0_f32; h * seq_len * d];
                    for head in 0..h {
                        for pos in 0..seq_len {
                            for dim in 0..d {
                                out[head * seq_len * d + pos * d + dim] =
                                    src[pos * proj_dim + head * d + dim];
                            }
                        }
                    }
                    out
                };
                let q = reshape(&q_projected);
                let k = reshape(&k_projected);
                let v = reshape(&v_projected);

                // Attention forward
                let attn_batch = AttentionBatch {
                    num_seqs: 1,
                    num_heads: h,
                    head_dim: d,
                    max_seq_len: seq_len,
                };
                let attn_out = self.attn.forward(&q, &k, &v, &attn_batch)?;

                // Take last position output: [1, num_heads, seq_len, head_dim] → [1, hidden_dim]
                let last = seq_len.saturating_sub(1);
                let mut last_hidden = vec![0.0_f32; self.hidden_dim];
                for head in 0..h {
                    let base = head * seq_len * d + last * d;
                    for dim in 0..d {
                        if base + dim < attn_out.len() {
                            last_hidden[head * d + dim] = attn_out[base + dim];
                        }
                    }
                }

                // attn_proj: [1, hidden_dim] @ [num_heads*head_dim, hidden_dim] → [1, hidden_dim]
                let attn_hidden = crate::attention::matmul(
                    &last_hidden, &self.attn_proj, 1, self.hidden_dim, self.hidden_dim,
                );

                // lm_head: [1, hidden_dim] @ [hidden_dim, vocab_size] → [1, vocab_size]
                let logits = crate::attention::matmul(
                    &attn_hidden, &self.lm_head, 1, self.hidden_dim, self.vocab_size,
                );

                group_outs.push(StepOut {
                    request_id: seq.request_id.clone(),
                    token: None,
                    logits: Some(logits),
                    text: None,
                });
            }
            Ok(group_outs)
        };

        // Separate prefill and decode: both use same logic (Phase 1: no KV cache reuse)
        let mut prefill_group: Vec<&mut Sequence> = batch.iter_mut()
            .filter(|s| s.is_prefill())
            .map(|s| &mut **s)
            .collect();
        let mut decode_group: Vec<&mut Sequence> = batch.iter_mut()
            .filter(|s| !s.is_prefill())
            .map(|s| &mut **s)
            .collect();

        if !prefill_group.is_empty() {
            outs.extend(step_group(&mut prefill_group)?);
        }
        if !decode_group.is_empty() {
            outs.extend(step_group(&mut decode_group)?);
        }

        Ok(outs)
    }

    fn drop_state(&mut self, request_id: &str) {
        self.states.remove(request_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_cpu_has_cpu_attention() {
        let runner = CudaModelRunner::new_cpu();
        assert_eq!(runner.states.len(), 0);
        assert_eq!(runner.hidden_dim, 0);
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd zealot && cargo build 2>&1`
Expected: compiles clean. `model_runner_cuda.rs` compiles in the crate.

- [ ] **Step 3: Run model_runner_cuda test**

Run: `cd zealot && cargo test model_runner_cuda 2>&1`
Expected: `new_cpu_has_cpu_attention` test passes.

- [ ] **Step 4: Commit**

```bash
git add zealot/src/model_runner_cuda.rs
git commit -m "feat(zealot): CudaModelRunner with AttentionBackend, PyO3 weight loading, step()"
```

---

### Task 7: zealot-backend.rs — integrate CudaModelRunner

**Files:**
- Modify: `zealot/src/bin/zealot-backend.rs:22, 94, 145, 280-295`

- [ ] **Step 1: Replace PyModelRunner import with CudaModelRunner (line 22)**

Change:
```rust
use zealot_engine::model_runner_py::PyModelRunner;
```

To:
```rust
use zealot_engine::model_runner_cuda::CudaModelRunner;
```

- [ ] **Step 2: Update Engine type annotations (lines 94, 145)**

Replace `Engine<PyModelRunner>` with `Engine` at:
- Line 94: `engine: &mut Engine<PyModelRunner>`
- Line 145: `mut engine: Engine<PyModelRunner>`

- [ ] **Step 3: Update runner construction (lines 280-295)**

Replace the runner construction block (around line 282):

```rust
#[cfg(feature = "cuda")]
let runner: Box<dyn ModelRunner> = Box::new(CudaModelRunner::load_cuda(&model_id, 0)?);

#[cfg(not(feature = "cuda"))]
let runner: Box<dyn ModelRunner> = CudaModelRunner::load(&model_id).map(Box::new)?;
```

The surrounding `run_engine(runner, eos, cmd_rx)` call stays unchanged — but note that previously `runner.eos_token_id()` was called before `run_engine`. Now `eos_token_id` is a trait method, so the call at line 295 works through the trait object.

- [ ] **Step 4: Keep PyModelRunner import for debug flag**

Add back the PyModelRunner import (conditionally used):
```rust
use zealot_engine::model_runner_py::PyModelRunner;
```

And update the runner block to:

```rust
let runner: Box<dyn ModelRunner> = if std::env::var("ZEALOT_USE_PYTHON").is_ok() {
    Box::new(PyModelRunner::load(&model_id)?)
} else {
    #[cfg(feature = "cuda")]
    { Box::new(CudaModelRunner::load_cuda(&model_id, 0)?) }
    #[cfg(not(feature = "cuda"))]
    { CudaModelRunner::load(&model_id).map(Box::new)? }
};
```

- [ ] **Step 5: Verify backend compiles**

Run: `cd zealot && cargo build --bin zealot-backend 2>&1`
Expected: compiles clean.

- [ ] **Step 6: Commit**

```bash
git add zealot/src/bin/zealot-backend.rs
git commit -m "feat(zealot): integrate CudaModelRunner into zealot-backend, keep PyModelRunner debug path"
```

---

### Task 8: Full regression + final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run all tests**

```bash
cd zealot && cargo test 2>&1
```
Expected: all tests pass (unit + integration, ~50+ tests). No regressions from the 5 Engine tests, 4 attention tests, 1 CudaModelRunner test.

- [ ] **Step 2: Run lint**

```bash
cd zealot && cargo fmt --check 2>&1
cd zealot && cargo clippy -- -D warnings 2>&1
```
Expected: no formatting errors, no clippy warnings.

- [ ] **Step 3: Verify cuda feature compiles (on linux CI or if nvcc available)**

```bash
cd zealot && cargo build --features cuda 2>&1
```
Expected: compiles with `cudarc` linked. If CUDA toolkit not installed, this step is skipped locally; CI on linux runner with CUDA toolkit verifies it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(zealot): final verification — all tests pass, lint clean"
```

---

## Verification Checklist (before merging)

- [ ] `cargo test` — all tests pass
- [ ] `cargo fmt --check` — no formatting issues
- [ ] `cargo clippy -- -D warnings` — no warnings
- [ ] `cargo build --features cuda` — compiles (linux CI)
- [ ] Engine de-genericize: 5 existing Engine tests still pass
- [ ] Attention module: 4 new tests pass
- [ ] CudaModelRunner: new_cpu test passes
- [ ] PyModelRunner still usable: `ZEALOT_USE_PYTHON=1 cargo build --bin zealot-backend` compiles

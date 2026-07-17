# Zealot Sampling 模块设计 (v2 — post review)

**日期**: 2026-07-13  
**状态**: proposed  
**依赖**: ADR-009（Zealot 语言栈）, zealot/src/engine.rs, proto/runtime/v1/runtime.proto  
**Review**: spec-document-reviewer 已审查，问题已修复

---

## 1. 动机

当前 PyModelRunner 使用 PyO3 嵌入的 torch 做采样，每次 decode step 穿越 FFI 边界。独立 Rust 采样模块消除此开销，为 Constrained Decode 集成做准备。

---

## 2. 类型定义

### 2.1 SamplingParams

```rust
#[derive(Debug, Clone)]
pub struct SamplingParams {
    /// Softmax 温度。0.0 = greedy, 1.0 = 原始分布, >1.0 = 更随机。
    /// 极小的非零值（< 1e-7）内部 clamp 到 greedy 路径避免数值溢出。
    pub temperature: f32,
    /// Top-K: 0 = disabled, 1 = argmax, k = keep top k.
    pub top_k: u32,
    /// Top-P (nucleus): 0.0 = disabled. 保留累积概率 ≥ p 的最小 token 集合。
    pub top_p: f32,
    /// Repetition penalty (multiplicative): logit>0 → /penalty, logit≤0 → *penalty.
    /// 1.0 = no-op. 对标 HuggingFace 标准公式。
    pub repetition_penalty: f32,
    /// Frequency penalty (additive per count). 0.0 = no-op.
    pub frequency_penalty: f32,
    /// Presence penalty (additive, binary: appears-at-all → minus flat value). 0.0 = no-op.
    /// 对标 OpenAI presence_penalty。与 frequency_penalty 可同时使用。
    pub presence_penalty: f32,
    /// Deterministic seed. None = use engine-global RNG.
    /// Some(seed) = seed a per-request RNG from this value.
    pub seed: Option<u64>,
}

impl Default for SamplingParams {
    fn default() -> Self {
        Self {
            temperature: 1.0,
            top_k: 0,
            top_p: 0.0,
            repetition_penalty: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            seed: None,
        }
    }
}
```

### 2.2 SampledToken — token ID 类型统一为 i64

```rust
/// 采样结果。token_id 使用 i64（与 Sequence.output_tokens、StepOut.token 一致）。
#[derive(Debug, Clone)]
pub struct SampledToken {
    pub token_id: i64,
    /// softmax 后该 token 的概率的自然对数。
    /// greedy 路径也计算（轻量 softmax），不会返回 0.0 作为 sentinel。
    pub logprob: f32,
}
```

### 2.3 错误类型

```rust
/// 采样错误
#[derive(Debug)]
pub enum SamplingError {
    /// 空 logits 输入
    EmptyLogits,
    /// 所有 token 被 mask（top-k/top-p/constraint 过严）
    AllTokensMasked { num_tokens: usize },
}
```

---

## 3. Sampler API

```rust
/// 采样器。零成本构造（零大小类型）。
pub struct Sampler;

impl Sampler {
    /// 执行采样流水线。
    ///
    /// # Arguments
    /// * `logits` - vocab_size 长度的原始 logits（来自 model forward）
    /// * `prev_output_ids` - 已生成的 token ID 序列。prefill 阶段为空。
    /// * `params` - 采样参数
    /// * `rng` - 随机数生成器（per-request: 如果 params.seed 有值则从 seed 构造）
    ///
    /// # Returns
    /// Ok(SampledToken) 或 Err(SamplingError::AllTokensMasked)
    pub fn sample(
        &self,
        logits: &[f32],
        prev_output_ids: &[i64],
        params: &SamplingParams,
        rng: &mut impl Rng,
    ) -> Result<SampledToken, SamplingError>;
}
```

---

## 4. 采样流水线

```
sample(logits, prev_output_ids, params, rng):
│
├─ 1. 输入验证
│    if logits.is_empty() → Err(EmptyLogits)
│
├─ 2. Temperature clamp + Greedy 快路径
│    // 极小 temperature (< 1e-7) 视为 greedy，避免数值溢出
│    if params.temperature < 1e-7:
│      let max_idx = argmax(logits)
│      let logprob = lightweight_logprob(logits, max_idx)  // 非 0.0，真实值
│      return Ok({ token_id: max_idx, logprob })
│
├─ 3. 复制 logits → scores (Vec<f32>)
│    // FUTURE: 用 buffer pool 避免每次分配
│    // 当前 vocab_size ~128k 时每次分配 ~512KB，可接受
│
├─ 4. Temperature scaling
│    if params.temperature != 1.0:
│      let inv_t = 1.0 / params.temperature
│      for s in &mut scores { *s *= inv_t }
│
├─ 5. Presence penalty (先于 frequency，逻辑独立)
│    if params.presence_penalty != 0.0 && !prev_output_ids.is_empty():
│      let mut seen: HashSet<i64> = HashSet::new()
│      for &id in prev_output_ids { seen.insert(id) }
│      for id in seen:
│        scores[id as usize] -= params.presence_penalty
│
├─ 6. Frequency penalty (count-based)
│    if params.frequency_penalty != 0.0 && !prev_output_ids.is_empty():
│      let mut freq: HashMap<i64, u32> = HashMap::new()
│      for &id in prev_output_ids { *freq.entry(id).or_insert(0) += 1 }
│      for (id, count) in freq:
│        scores[id as usize] -= (count as f32) * params.frequency_penalty
│
├─ 7. Repetition penalty (multiplicative, per occurrence)
│    if params.repetition_penalty != 1.0 && !prev_output_ids.is_empty():
│      let pen = params.repetition_penalty
│      for &id in prev_output_ids:
│        let idx = id as usize
│        if idx < scores.len():
│          if scores[idx] > 0.0 { scores[idx] /= pen }
│          else                  { scores[idx] *= pen }
│
├─ 8. Top-K 过滤
│    if params.top_k > 0 && (params.top_k as usize) < scores.len():
│      let k = params.top_k as usize
│      // select_nth_unstable: O(n), 只部分排序
│      let (_, &mut kth, _) = scores.select_nth_unstable_by(k - 1,
│          |a, b| b.partial_cmp(a).unwrap_or(Ordering::Equal))
│      for s in &mut scores { if *s < kth { *s = f32::NEG_INFINITY } }
│
├─ 9. Top-P (nucleus) 过滤
│    if params.top_p > 0.0 && params.top_p < 1.0:
│      let probs = softmax(&scores)
│      // 创建 (prob, index) 对
│      let mut indexed: Vec<(f32, usize)> = probs.iter().copied()
│          .enumerate().map(|(i, p)| (p, i)).collect()
│      // OPTIMIZATION NOTE: 当前对全量 vocab (128k) 做 sort，O(n log n)。
│      // M5 优化：用 select_nth_unstable 找 cutoff 点后只部分排序 selected 个元素
│      indexed.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(Ordering::Equal))
│      // 累加概率，计数 selected，mask 其余
│      let mut cum = 0.0_f32;
│      let mut selected = 0_usize;
│      for &(p, _) in &indexed {
│          cum += p;
│          selected += 1;
│          if cum >= params.top_p { break }
│      }
│      for &(_, idx) in &indexed[selected..]:
│          scores[idx] = f32::NEG_INFINITY
│
├─ 10. Softmax → 概率
│     let probs = softmax(&scores)
│     if probs.iter().all(|p| *p == 0.0 || !p.is_finite()):
│       → Err(AllTokensMasked { num_tokens: scores.len() })
│
├─ 11. 采样
│     let token_id = sample_multinomial(&probs, rng) as i64
│     let logprob = probs[token_id as usize].ln()
│     Ok({ token_id, logprob })
```

### 辅助函数

```rust
/// 快速求 argmax 对应位置的 logprob（不分配完整 softmax 向量）。
fn lightweight_logprob(logits: &[f32], max_idx: i64) -> f32 {
    let max = logits.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));
    let exps: f32 = logits.iter().map(|&x| (x - max).exp()).sum();
    let prob = (logits[max_idx as usize] - max).exp() / exps;
    prob.ln()
}

/// 数值稳定的 softmax。
fn softmax(scores: &[f32]) -> Vec<f32> { /* standard max-subtract impl */ }

/// CDF + 均匀随机数采样。
fn sample_multinomial(probs: &[f32], rng: &mut impl Rng) -> i64;
```

---

## 5. Proto 变更：InferParams 扩展

`proto/runtime/v1/runtime.proto` 中新增字段：

```protobuf
message InferParams {
  uint32 max_tokens = 1;
  float temperature = 2;
  float top_p = 3;
  repeated string stop = 4;
  string json_schema = 5;
  uint32 top_k = 6;               // ← new
  float repetition_penalty = 7;    // ← new
  float frequency_penalty = 8;     // ← new
  float presence_penalty = 9;      // ← new
  uint64 seed = 10;                // ← new (0 = no seed, use engine-default RNG)
}
```

---

## 6. Engine 集成

### 6.1 Engine 结构体修改

```rust
pub struct Engine<R: ModelRunner> {
    model_runner: R,
    scheduler: Scheduler,
    sampler: Sampler,              // ← 新增，零大小
    rng: StdRng,                   // ← 新增，引擎级默认 RNG
}

impl<R: ModelRunner> Engine<R> {
    pub fn step(&mut self) -> Result<Vec<TokenEvent>, ZealotError> {
        // 1. scheduler 选择 batch
        // 2. runner.step(&mut batch) → 获取每 seq 的 logits
        // 3. 对每个 seq:
        //    let seed_rng = if let Some(seed) = seq.params.sampling.seed {
        //        StdRng::seed_from_u64(seed)  // per-request 可重现
        //    } else {
        //        &mut self.rng                 // shared engine RNG
        //    };
        //    let sampled = self.sampler.sample(
        //        &seq_logits, &seq.output_token_ids, &seq.params.sampling, seed_rng
        //    );
        //    match sampled {
        //        Ok(tok) => seq.push_token(tok.token_id, tok.logprob),
        //        Err(AllTokensMasked) => seq.finish(FinishReason::Error),
        //    }
        // 4. return TokenEvents
    }
}
```

### 6.2 StepOut 扩展

当前 `StepOut`（engine.rs:22）含 `request_id`, `token`, `audio`, `text`, `index`。添加 `logits` 字段以支持 Engine 侧采样：

```rust
pub struct StepOut {
    pub request_id: String,         // unchanged: 保持 String 类型，匹配现有调用方
    pub token: Option<i64>,         // changed: runner 不做采样时 = None，做采样时 = Some(n)
    pub logits: Option<Vec<f32>>,   // NEW: runner 返回 logits 供 Engine 采样
    pub text: Option<String>,       // unchanged: detokenizer 仍在 PyModelRunner
    pub finish_reason: Option<FinishReason>,
    pub usage: Option<UsageInfo>,
}
```

**Engine 分支逻辑**（§6.1 step 伪代码汇总）：
```rust
for step_out in step_outs {
    if let Some(logits) = step_out.logits {
        // Engine 做采样 (Rust sampler)
        let sampled = self.sampler.sample(&logits, &seq.output_token_ids, &seq.sampling_params, rng)?;
        seq.push_token(sampled.token_id, sampled.logprob);
    } else if let Some(tok) = step_out.token {
        // Runner 自己做采样 (向后兼容：测试/脚本 runner)
        seq.output_tokens.push(tok);
    }
    // text 字段继续透传（detokenizer 仍在 PyModelRunner）
}
```

### 6.3 Detokenizer 说明

Engine 对 token → text 转换不感知。当前 `PyModelRunner.decode_token()` 仍负责 detokenization，`StepOut.text` 字段继续透传。将 detokenizer 从 Python 剥离是独立任务，不在本 spec 范围。

### 6.4 SamplingParams 流：Proto → Engine 路径

**1. Proto → Rust 转换**（`zealot-backend.rs` 中 gRPC handler）：
```rust
fn infer_params_to_sampling(params: &InferParams) -> SamplingParams {
    SamplingParams {
        temperature: if params.temperature == 0.0 { 0.0 } else { params.temperature },
        top_k: params.top_k,
        top_p: params.top_p,
        repetition_penalty: if params.repetition_penalty == 0.0 { 1.0 } else { params.repetition_penalty },
        frequency_penalty: params.frequency_penalty,
        presence_penalty: params.presence_penalty,
        seed: if params.seed == 0 { None } else { Some(params.seed) },
    }
}
// proto seed=0 → None (use engine RNG), proto seed>0 → Some(n) (per-request deterministic)
```

**2. EngineCmd 扩展**：当前 `EngineCmd::Infer` 不含采样参数。添加 `sampling_params: SamplingParams` 字段：
```rust
pub enum EngineCmd {
    Infer {
        messages: Vec<Message>,
        max_tokens: u32,
        sampling_params: SamplingParams,  // NEW
        priority: u32,
        tx: oneshot::Sender<...>,
    },
    // ...
}
```

**3. Sequence 结构体扩展**：`Sequence`（scheduler.rs）添加 `pub sampling_params: SamplingParams` 字段。Engine 从 `cmd.sampling_params` → `seq.sampling_params` 在 scheduler 分配 seq 时传递。

---

## 7. CUDA / 统一内存

### 当前阶段（CPU layout）

本模块假设 logits 在 **CPU 内存** 中（`&[f32]`）。PyModelRunner 的 torch CPU forward 产生的 logits 已在 CPU 上，采样开销可接受。

### 未来 CUDA 阶段

当 CUDA 前向 kernel 部署后，logits 在 GPU 上。将 vocab_size ~128k 的 float32 向量从 GPU 传回 CPU 仅用于采样是低效的（~512KB 拷贝 + 同步点）。

**应对方案**（M5-M6 细化，非本节实现）：

- **Option A**: Sampler 增加 `sample_cuda(device_logits: CudaSlice<f32>)` 分支，内部用 CUDA kernel 做 argmax/top-k/softmax/sampling
- **Option B**: Engine 侧统一内存管理：前向做完后 logits 已在 unified memory，`sample()` 可直接访问
- **Option C**: 保留 CPU 采样直到实测发现瓶颈。512KB 拷贝在 PCIe 4.0 上 < 10μs，与采样计算时间相当

**本 spec 确保**：`Sampler::sample()` 签名不绑定到 CPU 内存，后续可通过 `impl Sampler for CudaSampler` trait 扩展或增加方法，不影响 Engine 调用方。

---

## 8. 测试策略

### 8.1 单元测试（cargo test）

| 测试名 | 验证点 |
|--------|--------|
| `temperature_zero_is_greedy` | t=0 → argmax，多次运行确定相同，logprob ≠ 0.0 |
| `temperature_clamp` | t < 1e-7 → 走 greedy 路径，不溢出 |
| `temperature_scaling_increases_entropy` | t=2 → 分布比 t=1 更均匀 |
| `top_k_one_is_argmax` | k=1 → 全参数默认下返回 argmax |
| `top_k_filters_outside_top_k` | k=3 → token 不在 top 3 则概率 = 0 |
| `top_p_nucleus_cumsum` | p=0.9 → 保留的 token 累积概率 ≥ 0.9 |
| `top_p_disabled_at_1` | p=1.0 → 所有 token 保留 |
| `repetition_penalty_lowers_repeated` | 已出现 token → 概率下降 |
| `frequency_penalty_scales_with_count` | 出现 3 次的 token 比出现 1 次的受更多惩罚 |
| `presence_penalty_additive` | 出现过的 token 统一减固定值 |
| `all_params_combined` | 所有参数启用 → 无 panic |
| `empty_logits_error` | 空切片 → `Err(EmptyLogits)` |
| `all_masked_error` | 全部 token 被 mask → `Err(AllTokensMasked)` |
| `deterministic_with_seed` | same seed + same input → same output |
| `different_seeds_different` | 不同 seed → 输出可能不同（高概率分布下验证） |
| `softmax_sums_to_one` | 任意输入，softmax 输出总和 = 1.0（容差 ε=1e-5） |
| `softmax_stable_with_large_values` | logits ∈ [-1e5, 1e5] → 无 NaN |
| `greedy_logprob_is_valid` | greedy 路径 logprob ≤ 0.0 且 ≥ ln(1/vocab_size) |

### 8.2 Property-based 测试（proptest）

```
fn sampling_never_panics()    // 随机 params + 随机 logits，永不 panic
fn softmax_always_sums_to_one // 随机 logits
fn top_k_never_returns_outside // 随机 logits，top-k 结果在前 K 内
```

### 8.3 集成测试

现有的 `cpu_infer_e2e.rs` 在采样迁移后应继续通过。

### 8.4 Benchmark（criterion）

```toml
[dev-dependencies]
criterion = "0.5"

[[bench]]
name = "sampling"
harness = false
```

| Benchmark | 场景 | 验收阈值 |
|-----------|------|---------|
| `sample_greedy` | vocab=128k, temperature=0 | < 5μs |
| `sample_top_k_top_p` | vocab=128k, top_k=50, top_p=0.9 | < 20μs |
| `sample_with_penalties` | vocab=128k, prev_tokens=200, all penalties | < 30μs |
| `softmax_128k` | 纯 softmax，vocab=128k | < 10μs |

---

## 9. 与分配压力相关的说明

当前设计每次 `sample()` 分配：
- `scores: Vec<f32>` — vocab_size × 4 bytes（128k → 512KB）
- `indexed: Vec<(f32, usize)>` — selected × 12 bytes（top-p selected ~50 → 600B）
- `probs: Vec<f32>` — 512KB（softmax 输出）

总计约 **1MB/次**。在 decode loop 中频繁分配会造成 allocator 压力。但：

1. 当前最大 batch size 为 32（Scheduler 设置），1MB × 32 = 32MB，仍在可接受范围
2. 每 step 间隔远大于分配时间（model forward 远重于采样）
3. 若后续实测发现瓶颈，可引入 reusable buffer pool（`&mut Buffer` 参数而非内部分配）。当前不实现——YAGNI——但签名预留了此扩展方向

---

## 10. 验收标准

- [ ] Proto `InferParams` 扩展：`top_k`、`repetition_penalty`、`frequency_penalty`、`presence_penalty`、`seed`
- [ ] `SamplingParams` 定义 + `Default` + 从 proto 转换
- [ ] `Sampler::sample()` 实现 + 完整流水线
- [ ] `lightweight_logprob()` — greedy 路径不返回 0.0
- [ ] `AllTokensMasked` 错误传播而非静默 token 0
- [ ] `StepOut.logits` 字段（Option<Vec<f32>>）
- [ ] `seed` 参数支持 per-request deterministic generation
- [ ] `temperature < 1e-7` clamp 到 greedy
- [ ] ≥ 18 个单元测试通过
- [ ] 2 proptest 通过
- [ ] `cpu_infer_e2e` 测试仍然通过
- [ ] criterion benchmark 脚本就位（非阻塞，可后续运行）

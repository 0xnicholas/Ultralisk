# Chunked Prefill: Prefill-Decode 分离原型

**日期**: 2026-07-20
**状态**: proposed
**依赖**: ADR-003 (Inference Engine vLLM), ADR-009 (Zealot Language Strategy)

---

## 1. 目标

为 Zealot Scheduler 实现 chunked prefill：长 prompt 拆分为多个 chunk 逐步 prefill，**其他 sequence 的** decode step 可在 chunk 之间穿插执行，提升 GPU 利用率（M6 原型验证）。

> 注意：单个 sequence 在整个 prefill 期间（所有 chunk 完成前）不会自己穿插 decode — 它停留在 prefilling 队列直到全部 prompt 处理完毕。穿插效果是跨 sequence 的：seq A 的 prefill chunk 和 seq B 的 decode 在同一 batch 中并行。

当前行为：一个 4096-token prompt 在一次 prefill 中处理完成，期间所有 decode 被阻塞。

## 2. 架构

```
Scheduler (schedule / advance_prefill)  ← 核心改动
    │
    ├── Sequence: prefill_pos + chunk_size  ← 新增字段
    │     step_input() 按 chunk 返回 token
    │     is_final_chunk() 判断是否最后一轮
    │
    ├── SchedulerConfig: prefill_chunk_size  ← 新增配置
    │     schedule() 提升时将 chunk_size 注入每个 seq
    │     advance_prefill() 替代 promote_to_decoding
    │
Engine (step)  ← 微小适配
    │
    ├── is_final_chunk → mark_prefilled; advance_prefill() 处理晋升
    └── advance_prefill() 替代旧 promote_to_decoding
```

**CudaModelRunner 无需改动**：每次 step 收到的是当前 chunk 的 token IDs，`is_prefill()` 仍为 true 直到所有 chunk 处理完成。

## 3. Sequence — prefill chunk 追踪

`zealot/src/scheduler.rs` 中 `Sequence` 新增字段：

```rust
pub struct Sequence {
    // ... 现有字段不变 ...
    prefill_pending: bool,       // 现有
    prefill_pos: usize,          // 新增：已 prefill 到的 prompt 位置，0=未开始
    chunk_size: usize,           // 新增：本步 prefill 的 token 数，schedule() 设定
}
```

`Sequence::new()` 初始化：
```rust
prefill_pos: 0,
chunk_size: 0,
```

### step_input() 改造

```rust
pub fn step_input(&self) -> Vec<i64> {
    if self.prefill_pending {
        let end = (self.prefill_pos + self.chunk_size).min(self.prompt_tokens.len());
        let mut ids: Vec<i64> = self.prompt_tokens[self.prefill_pos..end].to_vec();
        ids.extend_from_slice(&self.output_tokens);
        ids
    } else {
        vec![*self.output_tokens.last().expect("decode step requires generated token")]
    }
}
```

### is_final_chunk()

```rust
pub fn is_final_chunk(&self) -> bool {
    self.prefill_pos + self.chunk_size >= self.prompt_tokens.len()
}
```

### len() 改造

`len()` 被 `ensure_blocks` 用于计算 block 需求。chunked prefill 下仅有已处理的 token 占用 KV cache：

```rust
pub fn len(&self) -> usize {
    if self.prefill_pending {
        // 仅已处理过的 token 计入 KV cache 长度
        self.prefill_pos + self.output_tokens.len() + self.chunk_size
    } else {
        self.prompt_tokens.len() + self.output_tokens.len()
    }
}
```

> 这确保了 `ensure_blocks` 为 chunked prefill 的 seq 只分配当前需要的 block 数，而非全部 prompt 的 block。`mark_prefilled()` 保留：仅 `is_final_chunk() == true` 时由 Engine 调用。

### 抢占重置 prefill_pos

`ensure_blocks` 抢占 seq 时，KV cache 被释放，`prefill_pending = true` 被重新设置。chunked prefill 下还必须重置 `prefill_pos = 0` 和 `chunk_size = 0`，确保重新调度时从头 prefill 全部 prompt（与现有 recompute 语义一致）。`ensure_blocks` 中抢占路径新增：

```rust
victim.prefill_pos = 0;
victim.chunk_size = 0;
victim.prefill_pending = true;  // 已有
```

## 4. SchedulerConfig — 新增 chunk 参数

```rust
pub struct SchedulerConfig {
    pub max_num_seqs: usize,
    pub block_size: usize,
    pub num_gpu_blocks: usize,
    pub max_prefill_tokens: usize,       // 原有的 per-step prefill token 总预算
    pub prefill_chunk_size: usize,       // 新增：单个 seq 每次 prefill 的最大 chunk
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            max_num_seqs: 8,
            block_size: 16,
            num_gpu_blocks: 1024,
            max_prefill_tokens: 2048,
            prefill_chunk_size: 512,    // 默认值
        }
    }
}
```

## 5. schedule() 改造

`schedule()` 的阶段顺序调整：chunk 分配必须在 block 补齐之前，确保 `len()` 包含正确的 chunk_size。

```rust
// ── 1. 已在 prefilling 中的 seq：重新分配下一 chunk ──
//    必须在 promotion 之前，使 max_prefill_tokens 预算正确累计。
let mut prefill_tokens = 0_usize;
for seq in self.prefilling.iter_mut() {
    if seq.prefill_pending && seq.chunk_size == 0 {
        let remaining = seq.prompt_tokens.len().saturating_sub(seq.prefill_pos);
        let chunk = remaining.min(self.cfg.prefill_chunk_size);
        if prefill_tokens + chunk > self.cfg.max_prefill_tokens {
            break; // 预算用尽，该 seq 本轮跳过
        }
        seq.chunk_size = chunk;
        prefill_tokens += chunk;
    }
}

// ── 2. 提升 waiting → prefilling（chunked） ────────────────────
while let Some(seq) = self.waiting.first() {
    if self.prefilling.len() + self.decoding.len() >= self.cfg.max_num_seqs {
        break;
    }

    let remaining = seq.prompt_tokens.len().saturating_sub(seq.prefill_pos);
    let chunk = remaining.min(self.cfg.prefill_chunk_size);

    if prefill_tokens + chunk > self.cfg.max_prefill_tokens && prefill_tokens > 0 {
        break;
    }

    let total_len = seq.prefill_pos + chunk + seq.output_tokens.len();
    let need = blocks_for(total_len, self.cfg.block_size);
    if self.bm.available() < need {
        break;
    }

    let mut seq = self.waiting.remove(0);
    for _ in seq.blocks.len()..need {
        let h = self.bm.try_allocate().expect("available checked");
        seq.blocks.push(h);
    }
    seq.chunk_size = chunk;
    seq.status = SeqStatus::Running;
    prefill_tokens += chunk;
    self.prefilling.push(seq);
}

// ── 3. 为 prefilling + decoding 补齐 block ────────────────────────
//    此时 chunk_size 已设置，len() 返回正确的 KV cache 长度
let mut i = 0;
while i < self.prefilling.len() {
    i = Self::ensure_blocks(&mut self.prefilling, &self.cfg, &mut self.bm, &mut self.waiting, i, &mut preempted) + 1;
}
let mut i = 0;
while i < self.decoding.len() {
    i = Self::ensure_blocks(&mut self.decoding, &self.cfg, &mut self.bm, &mut self.waiting, i, &mut preempted) + 1;
}

// ── 4. 组装批次（排除 chunk_size == 0 的 prefilling seq） ──
let batch: Vec<&mut Sequence> = self.prefilling.iter_mut()
    .filter(|s| s.chunk_size > 0)
    .chain(self.decoding.iter_mut())
    .collect();
ScheduleOutput { batch, preempted }
```

### advance_prefill()

替代原先的 `promote_to_decoding`（保留原方法，在 advance_prefill 内部调用）：

```rust
/// Engine 在 prefill chunk 完成后调用。
/// 递增 prefill_pos；如果所有 chunk 完成，promote 到 decoding。
pub fn advance_prefill(&mut self, request_id: &str) {
    let idx = self.prefilling.iter().position(|s| s.request_id == request_id);
    let is_done = if let Some(idx) = idx {
        let seq = &mut self.prefilling[idx];
        seq.prefill_pos += seq.chunk_size;
        seq.chunk_size = 0;
        seq.prefill_pos >= seq.prompt_tokens.len()
    } else {
        false
    };
    if let Some(idx) = idx {
        self.prefilling[idx].chunk_size = 0;
        if is_done {
            self.promote_to_decoding(request_id);
        }
    }
}
```

## 6. Engine 适配

### 6a. Prefill 完成逻辑

`engine.rs` `step()` 中的 prefill 完成逻辑需要区分"chunk 完成"和"序列完成"：

```rust
// engine.rs step() 中的 prefill 完成逻辑：
// （原有代码：was_prefill 标记 + promote_to_decoding 调用）
for (seq, was) in batch.iter_mut().zip(was_prefill) {
    if was { seq.mark_prefilled(); }
}
drop(batch);
for rid in prefilled_ids {
    self.sched.promote_to_decoding(&rid);
}

// 改为：
for (seq, was) in batch.iter_mut().zip(was_prefill) {
    if was && seq.is_final_chunk() {
        seq.mark_prefilled();   // 仅全部完成时标记
    }
}
// 注意：非 final chunk 无需 mark_prefilled —
// advance_prefill 内部递增 prefill_pos + 重置 chunk_size
drop(batch);
for rid in prefilled_ids {
    self.sched.advance_prefill(&rid);
}
```

### 6b. 抑制中间 chunk 的 output token

Runner 每次 forward 都会生成一个 token。对于非 final 的 prefill chunk，这个 token 基于不完整的 prompt 上下文，是无效的。Engine 必须跳过该 token 的写入和发射：

```rust
// engine.rs step() 中，runner 返回 StepOut 后：
// 现有代码（约 line 176）：
seq.output_tokens.push(token);
result.tokens.push(TokenOut { request_id, token, text });

// 改为：
let is_valid_output = !seq.is_prefill() || seq.is_final_chunk();
if is_valid_output {
    seq.output_tokens.push(token);
    result.tokens.push(TokenOut {
        request_id: step_out.request_id,
        token,
        text,
    });
}
```

> `StepOut` 仍然通过 `logits` 字段返回 logits — Engine 的 Sampler 仅对有效输出（decode 或 final prefill chunk）采样 token。Runner 层不感知 chunk，继续返回完整 logits。

## 7. 不存在改动的组件

- **CudaModelRunner** — 不改。`step()` 接收 `Sequence` 对象，`step_input()` 返回的是 chunk token IDs。对 runner 而言 prefill 就是 prefill，不感知是否被分片。
- **PyModelRunner** — 不改。同上。
- **BlockManager** — 不改。block 分配逻辑不变，chunked prefill 产生相同的 token 总数。
- **Sampling / Tokenizer** — 不涉及。

## 8. 文件改动清单

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `zealot/src/scheduler.rs` | 主要改动 | Sequence: prefill_pos + chunk_size + step_input 改造 + len() + is_final_chunk。SchedulerConfig: prefill_chunk_size。schedule(): chunk 提升 + 2.5 重分配。advance_prefill() 新方法。test module 新增 3-4 个测试 |
| `zealot/src/engine.rs` | 微小改动 | step(): is_final_chunk 分支，advance_prefill 替代 promote_to_decoding |

## 9. 测试策略

### 新增测试

| 测试 | 文件 | 验证点 |
|------|------|--------|
| `chunked_prefill_splits_long_prompt` | scheduler.rs | prompt=1024, chunk_size=256 → 4 个 schedule() step 各返回一个 prefill seq，`is_final_chunk()` 仅最后为 true |
| `chunked_prefill_interleaves_with_decode` | scheduler.rs | 提交 A(prompt=512, chunk=256) + B(prompt=128, chunk=256)，schedule() 第一次 → A 的 chunk1 为 prefill。手动 push output_tokens 推进 A 和 B 各一次 step。第二次 schedule() → A 的 chunk2 + B decode 同时在 batch 中（A.is_prefill()=true, B.is_prefill()=false）
| `chunked_prefill_short_prompt_still_one_step` | scheduler.rs | prompt=128, chunk=256 → chunk > prompt，退化为单步完成，行为等价于原版 |
| `advance_prefill_tracks_position` | scheduler.rs | prompt_len=300, chunk=100，手动调用 advance_prefill 3 次，验证 prefill_pos 递进 |

### 回归测试

- Scheduler 现有 7 个测试：全部通过
- Engine 现有 5 个测试：全部通过
- 其余所有测试：无回归

## 10. 不在范围内的内容

- CudaModelRunner 的 chunk 适配（不需要 — runner 无感知）
- GPU 利用率实测（无 GPU 环境）
- FlashAttention 级别的 chunk 优化
- Prefill-Decode disaggregation（分离到不同 GPU — 这是 Phase 3 的物理分离，不是本 spec 的调度层 chunking）
- Chunk size 动态调整 / auto-tuning

## 11. 验收标准

1. Scheduler 7 个现有测试 + 4 个新测试全部通过
2. Engine 5 个现有测试全部通过，无回归
3. `cargo test` 全部通过，零失败
4. `promotion_respects_max_num_seqs` 等价行为不变（chunk_size ≥ prompt_len 时退化为非 chunked 行为）

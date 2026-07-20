# Chunked Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chunked prefill to Zealot Scheduler — split long prompts into chunks so decode steps interleave between chunks.

**Architecture:** Sequence tracks `prefill_pos` + `chunk_size`. Scheduler assigns chunks per-step and reassigns between steps. Engine suppresses intermediate tokens from non-final chunks. Scheduler reset `prefill_pos` on preemption.

**Tech Stack:** Rust, no new dependencies

**Spec:** `docs/superpowers/specs/2026-07-20-chunked-prefill-design.md`

---

### Task 1: Sequence — new fields + methods

**Files:**
- Modify: `zealot/src/scheduler.rs:56-124` (Sequence struct, new, len, step_input, add is_final_chunk)

- [ ] **Step 1: Add prefill_pos and chunk_size fields to Sequence**

At `scheduler.rs:56`, add two fields to the `Sequence` struct:
```rust
/// 已 prefill 到的 prompt 位置（0 = 未开始）
prefill_pos: usize,
/// 本步 prefill 的 token 数（schedule() 每步赋值）
chunk_size: usize,
```

- [ ] **Step 2: Initialize in Sequence::new**

In `Sequence::new()` (around line 82), add:
```rust
prefill_pos: 0,
chunk_size: 0,
```

- [ ] **Step 3: Update Sequence::len()**

Replace the existing `pub fn len(&self) -> usize` (lines 99-101) with:
```rust
pub fn len(&self) -> usize {
    if self.prefill_pending {
        self.prefill_pos + self.output_tokens.len() + self.chunk_size
    } else {
        self.prompt_tokens.len() + self.output_tokens.len()
    }
}
```

- [ ] **Step 4: Update step_input()**

Replace the existing `pub fn step_input` (lines 104-115) with:
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

- [ ] **Step 5: Add is_final_chunk()**

Add after `mark_prefilled()` (after line 123):
```rust
pub fn is_final_chunk(&self) -> bool {
    self.prefill_pos + self.chunk_size >= self.prompt_tokens.len()
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd zealot && cargo build 2>&1`
Expected: compiles. Scheduler tests may fail due to changed behavior — that's expected.

- [ ] **Step 7: Commit**

```bash
git add zealot/src/scheduler.rs
git commit -m "feat(zealot): add prefill_pos/chunk_size fields + chunked step_input"
```

---

### Task 2: SchedulerConfig — add prefill_chunk_size

**Files:**
- Modify: `zealot/src/scheduler.rs:126-147` (SchedulerConfig)

- [ ] **Step 1: Add prefill_chunk_size field**

Add after `max_prefill_tokens`:
```rust
/// 单个 seq 每次 prefill 的最大 chunk（token 数）
pub prefill_chunk_size: usize,
```

- [ ] **Step 2: Update Default impl**

In `Default for SchedulerConfig` (line 139-146), add:
```rust
prefill_chunk_size: 512,
```

- [ ] **Step 3: Verify compilation**

Run: `cd zealot && cargo build 2>&1`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add zealot/src/scheduler.rs
git commit -m "feat(zealot): add prefill_chunk_size to SchedulerConfig"
```

---

### Task 3: Scheduler — chunk-aware schedule() + batch filter

**Files:**
- Modify: `zealot/src/scheduler.rs:241-300` (schedule method)

- [ ] **Step 1: Rewrite schedule() with chunk ordering**

Replace the entire `pub fn schedule(&mut self) -> ScheduleOutput<'_>` method body (lines 241-300) with:

```rust
pub fn schedule(&mut self) -> ScheduleOutput<'_> {
    let mut preempted = Vec::new();

    // ── 1. Reassign chunks to existing prefilling seqs ─────────
    let mut prefill_tokens = 0_usize;
    for seq in self.prefilling.iter_mut() {
        if seq.prefill_pending && seq.chunk_size == 0 {
            let remaining = seq.prompt_tokens.len().saturating_sub(seq.prefill_pos);
            let chunk = remaining.min(self.cfg.prefill_chunk_size);
            if prefill_tokens + chunk > self.cfg.max_prefill_tokens {
                break;
            }
            seq.chunk_size = chunk;
            prefill_tokens += chunk;
        }
    }

    // ── 2. Promote waiting → prefilling ───────────────────────
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

    // ── 3. Ensure blocks for prefilling + decoding ────────────
    let mut i = 0;
    while i < self.prefilling.len() {
        i = Self::ensure_blocks(&mut self.prefilling, &self.cfg, &mut self.bm, &mut self.waiting, i, &mut preempted) + 1;
    }
    let mut i = 0;
    while i < self.decoding.len() {
        i = Self::ensure_blocks(&mut self.decoding, &self.cfg, &mut self.bm, &mut self.waiting, i, &mut preempted) + 1;
    }

    // ── 4. Assemble batch (exclude chunk_size==0 prefilling) ──
    let batch: Vec<&mut Sequence> = self.prefilling.iter_mut()
        .filter(|s| s.chunk_size > 0)
        .chain(self.decoding.iter_mut())
        .collect();

    ScheduleOutput { batch, preempted }
}
```

- [ ] **Step 2: Verify compilation + existing tests**

Run: `cd zealot && cargo test scheduler 2>&1`
Expected: existing tests may fail (chunk_size not yet reset in preemption). That's expected — fixed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add zealot/src/scheduler.rs
git commit -m "feat(zealot): chunk-aware schedule() with step reordering and batch filter"
```

---

### Task 4: Scheduler — advance_prefill + preemption reset

**Files:**
- Modify: `zealot/src/scheduler.rs:377-388` (promote_to_decoding area)
- Modify: `zealot/src/scheduler.rs:312-347` (ensure_blocks preemption area)

- [ ] **Step 1: Add advance_prefill method**

Add after `promote_to_decoding()` (after line 388):
```rust
/// Engine 在 prefill chunk 完成后调用。
/// 递增 prefill_pos；最终 chunk 时 promote 到 decoding。
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
    }
    if is_done {
        self.promote_to_decoding(request_id);
    }
}
```

- [ ] **Step 2: Reset prefill_pos on preemption in ensure_blocks**

In `ensure_blocks` (around line 327-331), add prefill_pos reset. Find the block where the victim seq is modified:
```rust
victim.prefill_pending = true;
victim.status = SeqStatus::Waiting;
```
Add two lines after `victim.prefill_pending = true;`:
```rust
victim.prefill_pos = 0;
victim.chunk_size = 0;
```

- [ ] **Step 3: Verify compilation**

Run: `cd zealot && cargo build 2>&1`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add zealot/src/scheduler.rs
git commit -m "feat(zealot): advance_prefill + prefill_pos reset on preemption"
```

---

### Task 5: Engine — adapt to chunked prefill

**Files:**
- Modify: `zealot/src/engine.rs:125-204` (step method, prefill handling area)

- [ ] **Step 1: Replace mark_prefilled + promote_to_decoding with chunked logic**

In `Engine::step()`, find the prefill completion block (around lines 181-189). Replace:

```rust
for (seq, was) in batch.iter_mut().zip(was_prefill) {
    if was {
        seq.mark_prefilled();
    }
}
// batch borrow ends here — safe to mutate scheduler
drop(batch);
for rid in prefilled_ids {
    self.sched.promote_to_decoding(&rid);
}
```

With:

```rust
for (seq, was) in batch.iter_mut().zip(was_prefill) {
    if was && seq.is_final_chunk() {
        seq.mark_prefilled();
    }
}
drop(batch);
for rid in prefilled_ids {
    self.sched.advance_prefill(&rid);
}
```

- [ ] **Step 2: Suppress output tokens for non-final prefill chunks**

In `Engine::step()`, find where tokens are pushed to `output_tokens` and `result.tokens` (around lines 156-176, after sampling). Wrap the push in a validity check:

After the token/text resolution code (after line 165), add before `seq.output_tokens.push(token)`:
```rust
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

Remove the old unconditional push lines that were replaced.

- [ ] **Step 3: Verify compilation**

Run: `cd zealot && cargo build 2>&1`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add zealot/src/engine.rs
git commit -m "feat(zealot): Engine adapts to chunked prefill — advance_prefill + token suppression"
```

---

### Task 6: Tests — chunked prefill scheduler tests

**Files:**
- Modify: `zealot/src/scheduler.rs:413+` (test module, add after existing tests)

- [ ] **Step 1: Add 4 chunked prefill tests**

Add after the last existing test (`finish_releases_all_blocks`, around line 569):

```rust
#[test]
fn chunked_prefill_splits_long_prompt() {
    let mut sched = Scheduler::new(SchedulerConfig {
        max_num_seqs: 8,
        block_size: 2,
        num_gpu_blocks: 1024,
        max_prefill_tokens: 512,
        prefill_chunk_size: 256,
    })
    .unwrap();
    // prompt=1024, chunk=256 → requires 4 schedule steps
    let seq = sched
        .make_sequence("a".into(), vec![1; 1024], 4, Priority::Medium, None, SamplingParams::default())
        .unwrap();
    sched.add(seq);

    // Step 1: first chunk
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(out.batch[0].is_prefill());
    assert!(!out.batch[0].is_final_chunk());
    // Simulate step_input consumption — advance
    sched.advance_prefill("a");

    // Step 2: second chunk
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(out.batch[0].is_prefill());
    assert!(!out.batch[0].is_final_chunk());
    sched.advance_prefill("a");

    // Step 3: third chunk
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(out.batch[0].is_prefill());
    assert!(!out.batch[0].is_final_chunk());
    sched.advance_prefill("a");

    // Step 4: fourth and final chunk (256*4 = 1024)
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(out.batch[0].is_prefill());
    assert!(out.batch[0].is_final_chunk());
    sched.advance_prefill("a");
    // Now in decoding, not prefilling
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(!out.batch[0].is_prefill());
}

#[test]
fn chunked_prefill_short_prompt_still_one_step() {
    let mut sched = Scheduler::new(SchedulerConfig {
        max_num_seqs: 8,
        block_size: 2,
        num_gpu_blocks: 1024,
        max_prefill_tokens: 512,
        prefill_chunk_size: 256,
    })
    .unwrap();
    // prompt=128 < chunk=256 → single step
    let seq = sched
        .make_sequence("a".into(), vec![1; 128], 4, Priority::Medium, None, SamplingParams::default())
        .unwrap();
    sched.add(seq);

    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(out.batch[0].is_final_chunk());
}

#[test]
fn chunked_prefill_interleaves_with_decode() {
    let mut sched = Scheduler::new(SchedulerConfig {
        max_num_seqs: 8,
        block_size: 2,
        num_gpu_blocks: 1024,
        max_prefill_tokens: 512,
        prefill_chunk_size: 256,
    })
    .unwrap();
    // A: prompt=512 (2 chunks), B: prompt=128 (1 chunk)
    let seq_a = sched
        .make_sequence("a".into(), vec![1; 512], 4, Priority::Medium, None, SamplingParams::default())
        .unwrap();
    let seq_b = sched
        .make_sequence("b".into(), vec![1; 128], 4, Priority::Medium, None, SamplingParams::default())
        .unwrap();
    sched.add(seq_a);
    sched.add(seq_b);

    // Step 1: A chunk1, B promoted (short prompt = single step = final chunk)
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 2);
    let a = out.batch.iter().find(|s| s.request_id == "a").unwrap();
    let b = out.batch.iter().find(|s| s.request_id == "b").unwrap();
    assert!(a.is_prefill());
    assert!(!a.is_final_chunk()); // A has more chunks
    assert!(b.is_prefill());
    assert!(b.is_final_chunk()); // B's prompt fits in one chunk
    sched.advance_prefill("a");
    sched.advance_prefill("b"); // B promoted to decoding

    // Step 2: A chunk2 (final) + B decode
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 2);
    let a = out.batch.iter().find(|s| s.request_id == "a").unwrap();
    let b = out.batch.iter().find(|s| s.request_id == "b").unwrap();
    assert!(a.is_prefill());
    assert!(a.is_final_chunk());
    assert!(!b.is_prefill()); // B is now decoding
}

#[test]
fn advance_prefill_tracks_position() {
    let mut sched = Scheduler::new(SchedulerConfig {
        max_num_seqs: 8,
        block_size: 2,
        num_gpu_blocks: 1024,
        max_prefill_tokens: 512,
        prefill_chunk_size: 100,
    })
    .unwrap();
    let seq = sched
        .make_sequence("a".into(), vec![1; 300], 4, Priority::Medium, None, SamplingParams::default())
        .unwrap();
    sched.add(seq);

    sched.schedule();
    sched.advance_prefill("a");
    // Second call to schedule sets next chunk
    sched.schedule();
    sched.advance_prefill("a");
    // Third
    sched.schedule();
    sched.advance_prefill("a");

    // Prompt is 300, chunk is 100. After 3 advance_prefills, seq should be in decoding
    let out = sched.schedule();
    assert_eq!(out.batch.len(), 1);
    assert!(!out.batch[0].is_prefill(), "should be in decoding after 3 chunks complete");
}
```

- [ ] **Step 2: Run new tests**

Run: `cd zealot && cargo test chunked_prefill 2>&1`
Expected: 4 new tests pass.

- [ ] **Step 3: Run all scheduler tests**

Run: `cd zealot && cargo test scheduler 2>&1`
Expected: all 7 existing + 4 new = 11 tests pass.

- [ ] **Step 4: Commit**

```bash
git add zealot/src/scheduler.rs
git commit -m "test(zealot): add 4 chunked prefill scheduler tests"
```

---

### Task 7: Full regression + final verification

**Files:** (none — verification only)

- [ ] **Step 1: Run all tests**

```bash
cd zealot && cargo test 2>&1
```
Expected: all tests pass (~62 total), zero failures.

- [ ] **Step 2: Run lint**

```bash
cd zealot && cargo fmt --check 2>&1
cd zealot && cargo clippy 2>&1
```
Expected: no formatting errors, no new clippy warnings.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(zealot): final verification — all tests pass after chunked prefill"
```

---

## Verification Checklist

- [ ] `cargo test` — all tests pass
- [ ] `cargo fmt --check` — clean
- [ ] `cargo clippy` — no new warnings
- [ ] Scheduler: 7 existing + 4 new tests pass
- [ ] Engine: 5 existing tests pass (no regression)
- [ ] Short prompt (chunk > prompt) behaves identically to old behavior

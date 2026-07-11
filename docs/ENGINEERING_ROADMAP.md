# Ultralisk 工程技术路线图

> **版本**: v1.0  
> **日期**: 2026-07-11  
> **依据**: ADR-000 ~ ADR-010  
> **周期**: 18 个月，4 个 Phase

---

## 总览

```
Phase 1（1-3 月）        Phase 2（4-6 月）         Phase 3（7-12 月）       Phase 4（13-18 月）
MVP 公有云推理           企业平台 + 自研引擎       私有化 + 全栈引擎         全栈平台
─────                    ──────                    ──────                  ──────
• Gateway (Rust)         • Zealot fork + CUDA     • UIE 1.0 stable         • 客户私有模型
• vLLM 部署              • Reserved 策略            • RadixAttention 集成    • GPU 智能调度
• Serverless + Batch     • 多租户 + RBAC           • 私有化 Console         • 高级推理优化
• Console API (TS→真实DB) • ClickHouse 上线          • Dedicated 策略         • Fine-tuning
• PostgreSQL + Redis     • Cost Analytics          • SSO / 审计日志         • 专业服务
• Loki 日志              • Incident + AI诊断        • Setup Wizard           • Model Marketplace
• Console UI             • GPU Utilization 页面     • Dedicated 隔离边界      • 多 Region
```

---

## Phase 1 — MVP 公有云推理（第 1-3 月）

**目标**: 新用户注册后 5 分钟内发出第一个 API 请求。2 个模型，Serverless + Batch。

### 工作流

```
                    M1 (月末)          M2 (月末)           M3 (月末)
                    ───               ───                ───
Gateway ────────────┬─────────────────┬──────────────────┬
  基础路由+认证      │ 限流+攒批        │ 冷启动排队        │ ✅
                    │                 │                  │
Engine ─────────────┼─────────────────┼──────────────────┼
  vLLM 部署          │ 2模型上线        │ 批量推理优化      │ ✅
  AWQ INT4          │                 │                  │
                    │                 │                  │
Console API ────────┼─────────────────┼──────────────────┼
  Mock→PostgreSQL    │ Auth+APIKey     │ Billing 聚合      │ ✅
                    │                 │                  │
Console UI ─────────┼─────────────────┼──────────────────┼
  Phase 1a 页面      │ Phase 1b 页面   │ 联调+测试         │ ✅
                    │                 │                  │
Infra ──────────────┼─────────────────┼──────────────────┼
  K8s + vLLM        │ DCGM + Prom     │ Loki 日志         │ ✅
  PostgreSQL + Redis │                 │                  │
```

### M1 — 基础设施 + 首个推理请求（第 1 月末）

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Gateway** | Rust 框架搭建，`authenticate→ratelimit→route→proxy` 基础链。API Key 验证（Redis 缓存）。body-based 路由（model→Pool） | 002, 008 |
| **Engine** | vLLM 部署。Llama 3.1 8B AWQ INT4 跑通首个 `/v1/chat/completions`。模型权重存储在 S3/MinIO。**启动 GPU/CUDA 工程师招聘** | 003, 006 |
| **Console API** | Express 从内存 Mock 迁移到 PostgreSQL。Organization/APIKey/Model 表 CRUD。Auth Service 登录/登出 | 006, 008 |
| **Console UI** | Phase 1a 页面：Dashboard、Models、Playground、API Keys、Billing（读 Mock 数据） | - |
| **Infra** | K8s 集群（us-east-1，8×H100）。PostgreSQL（RDS）。Redis。KAI Scheduler 部署 | 004 |
| **验证** | `curl -X POST /v1/chat/completions -H "Authorization: Bearer ultr_xxx"` → 收到流式 token | - |

### M2 — 产品闭环（第 2 月末）

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Gateway** | Token 限流（Redis 滑动窗口）。Batch 策略攒批（60s 窗口，进程内内存）。Serverless Pool 和 Batch Pool 使用不同 model_id 路由 | 002, 005 |
| **Engine** | Llama 3.3 70B AWQ INT4 上线。2 个模型 Serverless 共享 Pool。Batch Pool 固定 2 Worker | 003, 005 |
| **Console API** | Usage Raw Event 写入 + 聚合 cron（T-2 窗口）。计费 upsert（request_id 主键）。API Key 创建/吊销（Pub/Sub 失效） | 006, 008 |
| **Console UI** | Phase 1b 页面：Endpoints、Batch Jobs、Playground session 持久化。接入真实 API | - |
| **Infra** | Prometheus + Grafana 基础面板（Gateway latency、vLLM QPS、GPU utilization）。ClickHouse schema 定义（不部署） | 007 |
| **验证** | 用户注册→创建 Key→Playground 测试→API 调用→Dashboard 看到用量→计费正确 | - |

### M3 — 冷启动 + 整合测试（第 3 月末）

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Gateway** | 冷启动排队：model 不在 GPU→Gateway 排队→KAI 分配 GPU→加载模型→返回。模型预热 API `POST /v1/models/{id}/warmup` | 002 |
| **Engine** | KAI Scheduler 集成：LoadModel(gpu_count, gpu_type)→KAI 分配→起 Pod | 004, 010 |
| **Console API** | 计费报表（月度，按 model/key 拆分）。预算告警 | 006 |
| **Console UI** | 内测反馈修复。主题切换 polish | - |
| **Infra** | Loki 日志采集（三类日志：app/inference/audit）。PTR 备份。Prometheus 告警规则 | 007 |
| **验证** | 冷启动：第一个请求排队 2-5min，后续秒级返回。取消请求正确计费。Key 吊销 < 100ms 失效 | - |

### Phase 1 验收标准

| 指标 | 目标 |
|------|------|
| Time to first API call | < 5 分钟 |
| 推理请求 P99 | < 2s |
| GPU 利用率 | > 30% |
| 取消请求计费准确率 | 100%（0-bill 率 0%） |
| Key 吊销生效延迟 | < 100ms |
| Console UI 页面可用数 | 15+ 页面 |

---

## Phase 2 — 企业平台 + 自研引擎（第 4-6 月）

**目标**: 从"开发者工具"到"企业平台"。启动 Zealot fork + CUDA 优化。Reserved 策略上线。

### 工作流

```
                    M4 (月末)          M5 (月末)           M6 (月末)
                    ───               ───                ───
Gateway ────────────┬─────────────────┬──────────────────┬
  多实例部署          │ 攒批迁至 Redis  │ Route Table CRD  │
                    │                 │                  │
Engine ─────────────┼─────────────────┼──────────────────┼
  Zealot fork 启动   │ Attention kernel│ Prefill-Decode    │ ✅ v2 原型
  招聘 GPU 工程师    │ 优化 v1         │ 分离原型验证      │
                    │                 │                  │
Control Plane ──────┼─────────────────┼──────────────────┼
  Reserved 策略      │ 多租户 RBAC     │ Cost Analytics   │
                    │                 │ 预算告警          │
Console UI ─────────┼─────────────────┼──────────────────┼
  Operations 模块    │ GPU Util 页面   │ Incident+AI诊断  │
                    │                 │                  │
Infra ──────────────┼─────────────────┼──────────────────┼
  ClickHouse 部署    │ 模型扩展至 10个  │ GPU 集群扩展      │
```

### M4 — Operations 模块 + Zealot fork 启动

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Gateway** | 多实例部署。Batch 攒批迁至 Redis 共享队列。路由表 weight 字段启用（A/B 测试预备） | 002, 010 |
| **Engine** | Fork vLLM。2-3 名 GPU/CUDA 工程师已到位（Phase 1 启动招聘）。定义 rebase cadence（每 2 周） | 003, 009 |
| **Control Plane** | Reserved 策略：TPS 保证 + 软隔离。多租户 RBAC（Owner/Admin/Developer/Read-only/Billing） | 005 |
| **Console UI** | Operations 模块：Clusters、Nodes、Deployments 页面 | - |
| **Infra** | ClickHouse 部署。GPU 指标 + request_events 分析副本写入。DCGM Exporter 全部 GPU 节点 | 006, 007 |

### M5 — Cost Analytics + CUDA 优化 v1

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Engine** | Attention kernel 优化 v1（FA-3 适配 H100，20-30% 吞吐）。自定义量化 per-layer mixed precision | 003, 009 |
| **Control Plane** | Cost Analytics：按 model/endpoint/key/team 五维度成本拆分。预算告警（阈值 + 通知） | 006 |
| **Console UI** | GPU Utilization 页面（时序图 + per-model/per-tenant）。Cost Analytics 页面 | - |

### M6 — 引擎 v2 原型 + AI 诊断

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Engine** | Prefill-Decode 分离原型验证。GPU 利用率 > 50% | 003 |
| **Gateway** | Route Table CRD 热更新（K8s watcher 替代 Redis pubsub） | 002 |
| **Console UI** | Incident 页面 + AI Diagnosis（三栏：时间线 + 指标 + AI 助手面板）。Auto-Remediation 策略配置 | 007 |
| **Infra** | GPU 集群扩展（us-west-2，4×H100）。模型扩展至 10 个 | - |

### Phase 2 验收标准

| 指标 | 目标 |
|------|------|
| GPU 利用率 | > 50% |
| Zealot fork 吞吐提升 | > 20% vs vLLM vanilla |
| 企业客户占比（>5 人团队） | > 30% |
| Operations 页面访问占比 | > 20% |
| Reserved 容量保证准确率 | > 99% |

---

## Phase 3 — 私有化 + Zealot 引擎（第 7-12 月）

**目标**: Zealot 1.0 (UIE) 发布。私有化部署产品化。Dedicated 策略上线。

### 工作流

```
                    M7-M8              M9-M10              M11-M12
                    ───                ───                 ───
Engine ─────────────┬──────────────────┬───────────────────┬
  Zealot Scheduler   │ Prefill-Decode   │ UIE 1.0 stable    │
  (Rust)             │ 分离上线          │ 对标 Together TIE │
                     │  Speculative     │ 的 80%+           │
                     │  Decode 集成     │                   │
                     │                  │                   │
Control Plane ───────┼──────────────────┼───────────────────┼
  Dedicated 策略     │ 私有化 Console   │ SSO + 审计         │
  S3 模型注册        │ Setup Wizard     │ 合规视图           │
                     │                  │                   │
Runtime ─────────────┼──────────────────┼───────────────────┼
  Rust Block Manager │ Rust Scheduler   │ Rust Tokenizer    │
  Constrained Decode │ RadixAttention   │ Python→Rust 迁移  │
                     │ 集成              │ (50%→20% Python)  │
                     │                  │                   │
Infra ───────────────┼──────────────────┼───────────────────┼
  Dedicated Node 隔离 │ 多 Region        │ 私有化交付包      │
                     │                  │ Helm chart        │
```

### M7-M8 — Zealot v2 + 私有化 Console

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Engine** | Zealot Scheduler（Rust）承接 Policy→ExecutionPlan。Prefill-Decode 分离上线 | 005, 009 |
| **Runtime** | Rust Block Manager（替代 Python 手动引用计数）。Constrained Decode Engine（Rust，对标 SGLang xgrammar） | 009, 010 |
| **Control Plane** | Dedicated 策略上线路由表。S3 模型注册（离线导入 HuggingFace/本地模型） | 005 |
| **Deploy** | Dedicated Node 物理隔离（至少 Node 级独享，可选物理机级） | 005 |

### M9-M10 — UIE alpha + SSO

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Engine** | UIE 1.0 alpha。内部 benchmark vs vLLM vanilla 2x 吞吐。Speculative Decoding 集成（Eagle draft model） | 003 |
| **Runtime** | Rust Scheduler（替代 Python scheduler，消除 GC tail latency）。RadixAttention 从 SGLang 借鉴集成 | 009 |
| **Control Plane** | 私有化 Console（同一套代码，构建配置切换 SaaS/私有化）。Setup Wizard | - |
| **Security** | SSO / SAML 集成。审计日志全量导出。TOTP 两步验证 | 008 |

### M11-M12 — UIE 1.0 stable + 私有化交付

| 工作流 | 交付内容 | ADR |
|--------|---------|-----|
| **Engine** | UIE 1.0 stable。性能达到 Together TIE 的 80%+。Zealot 替代 vLLM 成为默认引擎 | 003 |
| **Runtime** | Rust Tokenizer（零拷贝）。Python 占比从 80% 降至 20%（仅 Model Loader + API Server） | 009 |
| **Deploy** | 私有化交付包：Helm chart + installer + 部署文档。首个 POC 客户 | - |

### Phase 3 验收标准

| 指标 | 目标 |
|------|------|
| Zealot 吞吐（vs vLLM vanilla） | > 2x |
| vs Together TIE 性能 | > 80% |
| 私有化交付周期 | 签约到控制台可用 < 2 周 |
| 私有化客户数 | > 3 家 |
| Python 代码占比（Zealot 内部） | < 20% |

---

## Phase 4 — 全栈平台（第 13-18 月）

**目标**: 成为企业级 AI Infra 平台。客户私有模型。多 Region。Fine-tuning。GPU 智能调度。

| M13-M15 | M16-M18 |
|---------|---------|
| 客户私有模型上传/部署 | Fine-tuning Jobs (LoRA + 全参) |
| GPU 智能调度 L2（成本+SLA） | 高级推理优化（B200/GB200 适配） |
| 多 Region 扩展 | Spot 策略 |
| UIE 追平 Together TIE | Model Marketplace（远期） |
| 专业服务团队组建 | 客户 NPS > 40 |

---

## 跨 Phase 依赖

```
Phase 1 ──────── Phase 2 ──────── Phase 3 ──────── Phase 4
─────            ─────            ─────            ─────

Gateway ──────────┬────────────────┬────────────────┬─→
  (基础)           │ (多实例+Redis)  │ (CRD 热更新)   │

vLLM ─────────────┬────────────────┬────────────────┬─→
  (部署)           │ (fork+优化)    │ (被 Zealot 替代)│

Zealot Engine ────┼────────────────┼────────────────┬─→
                  │ (fork 启动)    │ (UIE 1.0)      │ (追平 TIE)

Control Plane ────┬────────────────┬────────────────┬─→
  (PG 迁移)        │ (Reserved+RBAC)│ (私有化+Dedicated)│(多Region)

Console UI ───────┬────────────────┬────────────────┬─→
  (P1a+1b)         │ (Operations)   │ (私有化)       │ (全功能)

GPU 工程师 ───────┼────────────────┼────────────────┬─→
                  │ 2-3 人          │ 5-8 人         │ 扩编
```

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| vLLM rebase 冲突累积 | Zealot fork 落后 upstream 过多 | 每 2 周 rebase cadence，冲突 > 50 文件暂停优化 |
| GPU 工程师招聘困难 | Phase 2 CUDA 优化延迟 | Phase 1 期间启动招聘，备选外部 contractor |
| KAI Scheduler 闭源 | 集群资源调度器需替换 | 回退方案 Volcano |
| 多租户安全漏洞 | 企业客户信任受损 | Phase 2 安全审计 + 渗透测试 |
| 私有化打包复杂 | 交付周期拉长 | Console 与 Backend 严格解耦，Helm chart 标准化 |
| 竞品降价 | 公有云利润空间受压 | 私有化部署作为差异化护城河，Zealot 引擎提升成本优势 |

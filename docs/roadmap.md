# Ultralisk 产品路线图（Roadmap）

> **工程技术路线图**: 详见 `docs/ENGINEERING_ROADMAP.md`——按工作流（Gateway/Engine/Control Plane/Infra）组织的里程碑计划。
> **版本**: v0.3（2026-07-11）  
> **范围**：Ultralisk 控制台、公有云 API、私有化部署  
> **周期**：18 个月，分 4 个 Phase  
> **目标**：先验证公有云 API 控制台，再叠加企业管控平台，最终交付私有化方案。

---

## 1. 产品愿景

**Ultralisk = Together AI 的公有云 API 体验 + Chamber 的 GPU 管控能力 + 私有化部署能力**

我们服务三类客户：
1. **AI 开发者**：需要便宜、OpenAI 兼容、零门槛的推理 API。
2. **ML/Platform 团队**：需要部署模型、监控 GPU、优化成本。
3. **企业管理员**：需要数据不出域、审计、SSO、合规的私有化方案。

---

## 2. Roadmap 总览

```
Phase 1（1-3 月）    Phase 2（4-6 月）     Phase 3（7-12 月）    Phase 4（13-18 月）
├─ 公有云 API MVP    ├─ 企业管控平台       ├─ 私有化部署         ├─ 全栈平台
├─ 2 个模型          ├─ 10 个模型          ├─ 20 个模型          ├─ 客户私有模型
├─ Console v1        ├─ Operations 模块    ├─ 私有化 Console     ├─ GPU 智能调度
├─ Serverless/Batch  ├─ 多租户 + RBAC      ├─ Setup Wizard       ├─ 高级推理优化
└─ 基础计费          └─ 增强成本归因       └─ SSO/审计/合规       └─ 专业服务团队
```

---

## 3. Phase 1：公有云 API MVP（第 1-3 月）

### 目标
让新用户在注册后 5 分钟内发出第一个 API 请求，验证 "OpenAI 兼容 + 更低价格" 的价值主张。

### 核心交付物

| 模块 | 交付内容 | 优先级 |
|------|---------|--------|
| **Backend API** | `POST /v1/chat/completions`、`/v1/embeddings`、`GET /v1/models` 及配套管理 API | P0 |
| **推理能力** | Serverless + Batch（50% 折扣），支持 2 个模型：Llama 3.1 8B、Llama 3.3 70B | P0 |
| **Console** | Dashboard、Models、Model Detail、Playground、API Keys、Endpoints、Batch Jobs、Billing | P0 |
| **模型目录** | 精选 2 个模型，含定价、能力标签、API 示例 | P0 |
| **用户系统** | 注册/登录/邀请、Organization、默认 Project、基础角色（Owner/Admin/Developer/Read-only）| P0 |
| **Endpoint 范围** | Phase 1 仅支持 Serverless / Reserved；Dedicated Endpoint 放到 Phase 2 | P0 |
| **计费** | 余额、充值、按 token 计费、基础用量图表 | P0 |
| **主题** | light / dark / system | P0 |

### 技术选型（锁定）
- 推理引擎：**vLLM**
- 量化：**AWQ INT4**（MVP），**FP8** 作为第二优先
- 前端：**React + TypeScript + shadcn/ui + Tailwind CSS**
- 后端：与 Console 严格解耦，API 契约见 `docs/prd-console-api.md`

### 成功指标
| 指标 | 目标 |
|------|------|
| Time to first API call | 新用户注册后 < 5 分钟 |
| Playground → API key 转化率 | > 30% |
| 控制台 DAU/WAU | 持续增长 |
| API P99 延迟 | < 2s |
| Batch 折扣后成本 | 达到 Serverless 的 50% |

### 里程碑
- **M1.1（第 1 月末）**：Backend API + Playground 可用，内部 dogfood。
- **M1.2（第 2 月末）**：Console 完整页面上线，邀请 TokenCamp 作为种子用户。
- **M1.3（第 3 月末）**：计费系统跑通，开始对外 Invitation-only 试用。

---

## 4. Phase 2：公有云 + 企业管控平台（第 4-6 月）

### 目标
从"开发者工具"扩展到"企业平台"，让 ML/SRE 团队能管理 GPU、归因成本、设置预算告警。

### 核心交付物

| 模块 | 交付内容 | 优先级 |
|------|---------|--------|
| **Operations 模块** | Clusters、Nodes、Deployments、GPU Utilization、Cost Analytics | P1 |
| **模型扩展** | 扩展到 10 个模型，覆盖 Chat / Embedding / Code / Vision 主力模型 | P1 |
| **多租户** | Organization → Project → Resource 三级隔离 | P1 |
| **RBAC 增强** | Owner/Admin/Developer/Read-only/Billing 完整权限矩阵 | P1 |
| **Endpoint 增强** | Reserved/Dedicated、自动扩缩容、指标监控 | P1 |
| **成本归因** | 按模型 / endpoint / API key / 团队 / 项目拆分 | P1 |
| **预算告警** | 月度预算阈值，邮件/Slack 通知 | P1 |
| **推理引擎 vLLM fork** | Fork vLLM，启动 CUDA kernel 优化（attention kernel、自定义量化） | P1 |
| **GPU 工程团队** | 招聘 2-3 名 GPU/CUDA 工程师 | P1 |
| **Prefill-Decode 分离** | 评估和实现 prefill/decode 分离调度，提升 GPU 利用率 | P1 |
| **Fine-tuning（评估）** | 评估需求，决定是否 Phase 3 做 | P2 |

### 成功指标
| 指标 | 目标 |
|------|------|
| Operations 页面访问占比 | > 20% |
| 企业客户占比（>5 人团队）| > 30% |
| GPU 利用率 | 从 30-40% 提升到 50-70% |
| 多租户 Bug 数 | < 5 个严重问题 |

### 里程碑
- **M2.1（第 4 月末）**：Operations 模块 MVP，可查看集群/节点/GPU 利用率。启动 vLLM fork 和 GPU 工程师招聘。
- **M2.2（第 5 月末）**：多租户 + RBAC 完整上线。首个 CUDA kernel 优化完成（attention kernel）。
- **M2.3（第 6 月末）**：成本归因和预算告警可用。Prefill-Decode 分离原型验证，GPU 利用率 > 50%。

---

## 5. Phase 3：私有化部署（第 7-12 月）

### 目标
交付可部署在客户数据中心的 Ultralisk 私有化方案，攻占金融、医疗、政务等合规敏感市场。

### 核心交付物

| 模块 | 交付内容 | 优先级 |
|------|---------|--------|
| **Zealot 1.0 发布** | Ultralisk Inference Engine 1.0，性能目标达到 Together TIE 的 80%+ | P0 |
| **GPU 工程团队扩充** | GPU/CUDA 团队扩至 5-8 人 | P1 |
| **RadixAttention 集成** | 借鉴 SGLang 前缀树 KV cache，集成到 Zealot | P1 |
| **全局公平调度** | Continuous Batching 公平性调度，降尾延迟 | P1 |
| **私有化控制台** | 同一套 Console 代码通过构建配置切换 SaaS/私有化模式 | P0 |
| **Setup Wizard** | 引导完成 K8s 接入、存储配置、GPU 节点注册、License 激活 | P1 |
| **Offline Model Registry** | 支持导入 HuggingFace / 本地模型，不依赖外网 | P1 |
| **模型扩展** | 扩展到 20 个模型 | P1 |
| **审计日志** | 用户操作、API 调用、模型部署全量审计，支持导出 | P0 |
| **SSO/SAML** | 与企业身份提供商集成 | P0 |
| **合规视图** | SOC2 / ISO27001 状态展示、数据保留策略 | P1 |
| **License & Support** | 软件许可、授权 GPU 数量、支持合约展示 | P1 |
| **交付物** | Helm chart / installer / 私有化部署文档 | P1 |

### 成功指标
| 指标 | 目标 |
|------|------|
| 私有化交付周期 | 签约到控制台可用 < 2 周 |
| 私有化客户数 | > 5 家 |
| 私有化收入占比 | > 30% |
| 审计日志完整性 | 100% 覆盖敏感操作 |

### 里程碑
- **M3.1（第 8 月末）**：Zealot 1.0 alpha 发布，内部 benchmark 达到 vLLM vanilla 的 2x。私有化 Console + Setup Wizard 第一个 POC。
- **M3.2（第 10 月末）**：Zealot 1.0 stable，审计日志 + SSO 上线。
- **M3.3（第 12 月末）**：Zealot 性能达到 Together TIE 的 80%+，私有化方案产品化。

---

## 6. Phase 4：全栈平台（第 13-18 月）

### 目标
成为企业级 AI Infra 平台，支持客户私有模型、高级调度、专业服务。

### 核心交付物

| 模块 | 交付内容 | 优先级 |
|------|---------|--------|
| **Zealot 持续优化** | 追平 Together TIE 性能，建立推理引擎品牌 | P1 |
| **高级推理优化** | 进一步的 kernel 级优化，支持 B200/GB200 等新硬件 | P2 |
| **客户私有模型** | 支持客户上传/导入自有模型并部署 | P1 |
| **模型扩展** | 20+ 模型，覆盖更多场景 | P2 |
| **Fine-tuning Jobs** | 如 Phase 2 评估通过，则上线 LoRA/全参数微调 | P2 |
| **专业服务团队** | 私有化交付、客户成功、技术支持 | P2 |
| **Marketplace** | 模型/插件生态（远期） | P3 |

### 成功指标
| 指标 | 目标 |
|------|------|
| 客户私有模型部署数 | > 10 个 |
| GPU 利用率 | > 70% |
| 年收入（ARR）| 达到可规模化增长阶段 |
| 客户 NPS | > 40 |

---

## 7. 跨阶段依赖与风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 后端 API 未就绪 | 控制台无法联调 | Phase 1 先用 mock 数据，定义好 API 契约 |
| 推理性能不及预期 | 无法支撑"比 Together AI 便宜 30-50%" | AWQ/FP8 优先，持续跟进 vLLM 新版本 |
| 私有化打包复杂 | 交付周期拉长 | Console 与 Backend 严格解耦，提供 Helm chart |
| 多租户安全漏洞 | 企业客户信任受损 | Phase 2 引入安全审计和渗透测试 |
| GPU 利用率提升困难 | 成本优势不明显 | 优先做调度和容量规划，而非追极致 Kernel 优化 |
| 竞争对手降价 | 公有云利润空间受压 | 私有化部署作为差异化护城河 |

---

## 8. 关键决策记录

| 决策 | 内容 | 理由 |
|------|------|------|
| Phase 1 模型数量 | 2 个（Llama 3.1 8B + Llama 3.3 70B）| 降低运维复杂度，验证核心流程 |
| 不做自研推理引擎 | 使用 vLLM | 避免研究成本，聚焦产品和私有化 |
| 私有化复用同一套 Console 代码 | 通过构建配置切换 SaaS/私有化 | 降低维护成本，保证体验一致 |
| Phase 1 不做移动端 | 仅保证桌面端 | 控制台是生产力工具，首屏在桌面 |
| 注册模式 | Invitation-only + 申请试用 | 早期控制成本、避免滥用 |

---

## 9. 与 PRD 的对应关系

| Roadmap Phase | PRD 章节 |
|---------------|---------|
| Phase 1 | PRD 5.1-5.7（Dashboard / Models / Playground / API Keys / Endpoints / Batch Jobs / Billing） |
| Phase 2 | PRD 5.8（Operations 模块）、9.1（多租户）、5.10（预算告警） |
| Phase 3 | PRD 5.9（私有化控制台）、11（安全与合规） |
| Phase 4 | PRD 5.8.5（增强 Cost Analytics）、Model Shaping（Fine-tuning） |

---

## 10. 下一步行动

1. **本周**：评审并确认 Phase 1 范围，锁定模型列表和定价。
2. **本周**：评审 `docs/prd-console.md` 和 `docs/prd-console-api.md`，冻结页面和 API 契约。
3. **第 1 周**：搭建前端项目骨架（React + shadcn/ui + Tailwind）。
4. **第 2 周**：搭建后端 vLLM 推理环境，完成第一个 `/v1/chat/completions` 调用。
5. **第 3 周**：完成 Dashboard + Playground 前端页面，接入 mock API。

---

*本文档基于 `docs/prd-console.md` 和 `docs/together-ai-analysis.md` 制定，随产品进展持续更新。*

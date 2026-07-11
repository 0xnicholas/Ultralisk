# Ultralisk

AI 推理云平台——开源大模型的 OpenAI 兼容 API，按量计费。

**对标**: Together AI 的推理能力 + Chamber 的 GPU 管控能力。  
**差异化**: 自研推理引擎（Zealot），私有化部署，GPU 利用率可见。

---

## 架构

```
Client → Cloud LB → Gateway (Rust) ─┬─ /v1/admin/* → Console API (管理)
                                    └─ /v1/chat/* → Backend Runtime → vLLM/Zealot → GPU
```

三层：Gateway（入口路由+认证）、Control Plane（管理编排+计费）、Data Plane（推理执行+GPU调度）。

完整架构详见 [架构设计文档](docs/architecture.md) 和 [11 篇 ADR](docs/adr/)。

---

## 快速开始

```bash
cd console
pnpm install
pnpm dev
```

- **Console API**: http://localhost:3100（Mock 数据，Express）
- **Console UI**: http://localhost:5173（React + Mantine v9）

目前是 Phase 1a 阶段：前端页面完整，后端为 Mock API。真实推理引擎（vLLM）和 Gateway 尚未部署。

---

## 项目结构

```
├── AGENTS.md                ← AI 编程 agent 指南
├── console/                 ← 项目主体（pnpm monorepo）
│   ├── console-api/         ← 管理后台 Mock API
│   ├── console-ui/          ← 管理后台前端
│   ├── brand/               ← 品牌资源
│   └── turbo.json           ← Turborepo 配置
├── docs/
│   ├── adr/                 ← 架构决策记录（000-010）
│   ├── architecture.md      ← 架构设计文档
│   ├── roadmap.md           ← 产品路线图
│   └── ENGINEERING_ROADMAP.md ← 工程路线图
└── .github/                 ← CI/CD
```

---

## 技术栈

| 层 | 技术 |
|---|------|
| Gateway | Rust（自研，body-based 路由） |
| Console API | TypeScript + Express 5 |
| Console UI | React 19 + TypeScript + Mantine v9 |
| 推理引擎 | vLLM（Phase 1）→ Zealot Rust+CUDA（Phase 2+） |
| 容器编排 | Kubernetes + KAI Scheduler |
| 数据 | PostgreSQL + Redis + ClickHouse + Loki + S3 |

---

## 路线图

18 个月，4 个 Phase。

| Phase | 周期 | 目标 |
|-------|------|------|
| 1 | 1-3 月 | MVP 公有云推理：2 个模型，Serverless + Batch |
| 2 | 4-6 月 | 企业平台：Reserved，Operations 模块，Zealot fork |
| 3 | 7-12 月 | 自研引擎 Zealot 发布，私有化部署 |
| 4 | 13-18 月 | 全栈平台：客户私有模型，多 Region，Fine-tuning |

详见 [产品路线图](docs/roadmap.md) 和 [工程路线图](docs/ENGINEERING_ROADMAP.md)。

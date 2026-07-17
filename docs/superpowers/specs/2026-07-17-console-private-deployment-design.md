# Console 私有化部署设计文档

> **日期**: 2026-07-17
> **状态**: approved
> **依赖**: PRD §5.9, ADR-000, ADR-008

## 1. 背景

Ultralisk Phase 3 目标：交付可部署在客户数据中心的私有化方案。Console 作为唯一的管理界面，需要在不增加维护成本的前提下同时支持 SaaS 和私有化两种运行模式。

### 核心约束

- **同一份代码库**：SaaS 和私有化共享同一份 Console 代码，不 fork 不拆分（PRD §15）。
- **同一份 Docker 镜像**：构建一次，通过 `DEPLOYMENT_MODE` env var 切换模式。
- **共享页面 > 80%**：Models、Playground、Operations（Clusters/Nodes/Deployments/GPU/Cost/Incidents）完全共享。
- **模式特有页面 < 20%**：SaaS 特有（Billing、API Keys）+ 私有化特有（Setup Wizard、Audit Logs、Compliance、License、SSO）。

## 2. 架构

### 2.1 模式切换

```
环境变量: DEPLOYMENT_MODE = "saas" | "private"
默认值: "saas"
```

前端通过 `src/utils/deployment.ts` 运行时判断，后端中间件通过 `req.deploymentMode` 传递。

### 2.2 目录结构

```
console-ui/src/
├── utils/
│   └── deployment.ts          ← isSaaS(), isPrivate(), MODE
├── layouts/
│   └── ConsoleLayout.tsx       ← 根据 mode 动态生成 sidebar items
├── App.tsx                    ← 根据 mode 挂载不同路由表
├── pages/                     ← 共享页面（两模式共有）
│   ├── dashboard/
│   ├── models/
│   ├── playground/
│   ├── clusters/
│   ├── nodes/
│   ├── deployments/
│   ├── gpu-utilization/
│   ├── cost-analytics/
│   ├── incidents/
│   └── endpoints/             ← 共享（Serverless/Reserved 两模式都有）
│   └── batch-jobs/            ← 共享
├── saas/                      ← SaaS 模式特有
│   └── pages/
│       ├── billing/
│       └── api-keys/
└── private/                   ← 私有化模式特有
    └── pages/
        ├── setup/             ← Setup Wizard
        ├── audit-logs/
        ├── compliance/
        ├── license/
        └── settings/
            └── sso/

说明：Organization 是共享页面（pages/settings/organization/），内部通过 isSaaS()/isPrivate()
条件渲染模式特有内容。SaaS 版显示计费计划和 API Key 用量，私有化版显示 License 信息和 Support 合约。
差异不大，不值得拆为两个独立组件。
```

后端 API （`console-api`）：

```
console-api/src/
├── routes/                    ← 共享路由
│   └── ...
├── saas/                      ← SaaS 特有路由
│   └── routes/                ← billing, apiKeys（私有化模式下不注册）
└── private/                   ← 私有化特有路由
    └── routes/                ← audit, license, sso（SaaS 模式下不注册）
```

### 2.3 后端模式确定

后端（Console API）在启动时读取 `DEPLOYMENT_MODE` 环境变量：

```typescript
// console-api/src/index.ts
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'saas';
```

路由注册在 startup 时条件执行：

```typescript
// SaaS 特有路由（私有化不注册）
if (DEPLOYMENT_MODE === 'saas') {
  app.use('/v1/admin', billingRoutes);
  app.use('/v1/admin', apiKeyRoutes);
  app.use('/v1/admin', invitationRoutes);
}

// 私有化特有路由（SaaS 不注册）
if (DEPLOYMENT_MODE === 'private') {
  app.use('/v1/admin', auditLogRoutes);
  app.use('/v1/admin', licenseRoutes);
  app.use('/v1/admin', ssoConfigRoutes);
}
```

不依赖 header/运行时判断，因为模式在部署时确定，运行期不变。

### 2.4 前端模式确定

`import.meta.env` 是构建时编译进 JS 的，单镜像方案下无法使用。改为 **运行时注入**：

Console API 在启动时读取 `DEPLOYMENT_MODE`，在 serve `index.html` 时注入：

```html
<!-- index.html 模板 — Console API 在响应时替换占位符 -->
<script>window.DEPLOYMENT_MODE = '__DEPLOYMENT_MODE__';</script>
```

```typescript
// console-api 使用 express.static 前加一个中间件
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/index.html') {
    const html = readFileSync('path/to/index.html', 'utf-8')
      .replace('__DEPLOYMENT_MODE__', process.env.DEPLOYMENT_MODE || 'saas');
    return res.type('html').send(html);
  }
  next();
});
```

前端通过 `window.DEPLOYMENT_MODE` 读取，`deployment.ts` 包装为工具函数。

### 2.5 路由注册（前端）

```typescript
// App.tsx — 路由表按 mode 合并
function AppRoutes() {
  const shared = SHARED_ROUTES;
  const modeSpecific = isPrivate() ? PRIVATE_ROUTES : SAAS_ROUTES;
  return <Routes>{...shared, ...modeSpecific}</Routes>;
}
```

**共享路由**（两模式都有）：`/dashboard`, `/models`, `/models/:id`, `/playground`, `/playground/:sessionId`, `/endpoints`, `/endpoints/new`, `/endpoints/:id`, `/batch-jobs`, `/batch-jobs/new`, `/batch-jobs/:id`, `/clusters`, `/clusters/:id`, `/nodes`, `/nodes/:id`, `/clusters/:clusterId/nodes/:nodeId`, `/deployments`, `/deployments/:id`, `/gpu-utilization`, `/cost-analytics`, `/incidents`, `/incidents/:id`, `/settings/profile`, `/settings/organization`

**SaaS 独有路由**：`/api-keys`, `/billing`

**私有化独有路由**：`/setup`, `/audit-logs`, `/compliance`, `/license`, `/settings/sso`

### 2.6 侧边栏

```
SaaS 侧边栏：
Home: Dashboard
Develop: Playground, Models, API Keys
Inference: Endpoints, Batch Jobs
Operations: Clusters, Nodes, Deployments, GPU Utilization, Cost Analytics, Incidents
Organization: Billing, Organization

私有化侧边栏：
Home: Dashboard
Develop: Playground, Models
Inference: Endpoints, Batch Jobs
Operations: Clusters, Nodes, Deployments, GPU Utilization, Cost Analytics, Incidents
Setup: Setup Wizard
Management: Audit Logs, License, Compliance
Settings: SSO, Organization
```

## 3. Phase 3 子项目清单

| 编号 | 子项目 | 里程碑 | 前置依赖 |
|------|--------|--------|---------|
| P3a | 模式切换架构 + SaaS/私有化页面拆分 | M7-M8 | 无 |
| P3b | Setup Wizard（4 步引导：K8s → 存储 → GPU → License） | M9-M10 | P3a |
| P3c | Offline Model Registry（S3/MinIO 模型导入） | M7-M8 | 无（独立于 Console 模式切换） |
| P3d | 审计日志（存储 + 查看页面 + CSV 导出） | M9-M10 | P3a |
| P3e | SSO/SAML 配置 + 合规视图 + License 管理 | M9-M10 | P3a |

## 4. 私有化模式的认证模型

私有化模式的认证与 SaaS 有本质区别：

| 维度 | SaaS | 私有化 |
|------|------|--------|
| 用户来源 | 注册/邀请 | SSO/SAML 自动同步 |
| 密码 | 有（Auth Service 管理） | 无，SSO 全权管理 |
| API Key | 有（开发者使用） | 无（私有化网络内不用 API Key）|
| 角色 | Owner/Admin/Developer/Read-only/Billing | 从 SSO groups 映射 |
| Auth Service | 独立部署 | 私有化部署内包含，SSO-only 模式 |

**设计决策**：Auth Service 在私有化模式下跳过 `login`/`register` 端点，仅加载 SSO 验证中间件。API Keys 页面不存在，SaaS 的 `apiKeys.ts` 路由不注册。用户管理通过 SSO 配置页面完成（非用户 CRUD）。

**P3a 边界**：Auth Service 的 SSO 模式改造是独立工作项，不阻塞 P3a。P3a 只需 Console API 在私有化模式下不调用 auth-service 的 login/register 端点即可。

**P3a 认证 gap**：SSO 在 P3e 才实现，P3a 的私有化模式没有真实的认证路径。开发阶段通过 dev-only bypass 解决（Console API 在私有化 + 开发环境返回 mock user）。生产环境私有化部署在 P3e 之前依赖 Gateway 的 mTLS 或 IP 白名单做简单访问控制。

**SSO 集成的详细设计**（包括 SAML 验证逻辑放在 auth-service 还是 Console API、metadata 交换流程）在 P3e 子项目的 spec 中定义。

## 5. 交付部署

- Docker image: `ultralisk/console:latest`（同一镜像用于 SaaS 和私有化）
- Helm chart values: `console.deploymentMode: "saas" | "private"`
- 私有化部署独立于外网，Console 不需要外网访问

## 6. 本地开发

开发时前端由 Vite dev server 提供服务，`window.DEPLOYMENT_MODE` 无法通过 Express 注入。通过 `VITE_DEPLOYMENT_MODE` env var + fallback 解决：

```typescript
// console-ui/src/utils/deployment.ts
export function getDeploymentMode(): 'saas' | 'private' {
  // 生产环境：Express 注入到 window
  if (typeof window !== 'undefined' && (window as any).DEPLOYMENT_MODE) {
    return (window as any).DEPLOYMENT_MODE;
  }
  // 开发环境：Vite 注入
  return (import.meta as any).env?.VITE_DEPLOYMENT_MODE || 'saas';
}
```

本地测试私有化模式：`DEPLOYMENT_MODE=private pnpm dev`

## 7. 已关闭的替代方案

- **分离代码库**: 否决。维护成本翻倍，功能偏差风险高。
- **双镜像 + 构建标志**: 否决。CI 复杂度增加，收益有限。env 切换足够安全（SaaS 页面只是不注册路由，客户无法访问）。
- **运行时 API feature flags**: 否决。过度设计。模式在部署时确定，部署后不变。

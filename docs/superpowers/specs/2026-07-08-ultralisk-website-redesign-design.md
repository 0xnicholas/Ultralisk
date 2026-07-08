# Ultralisk 官网改版设计文档

> 设计范围:营销站演进式重构 + 新增 Astro Starlight 文档站
> 设计日期:2026-07-08
> 相关决策:定位 B 路线(Chamber-like) + 全栈数据中心管理 + 服务支持

---

## 1. 背景与目标

### 1.1 项目现状

Ultralisk 当前代码已实现生产级 LLM API 基础设施层的核心能力:

- 鉴权与限流(API Key、QPS、token 配额)
- 可观测性(Prometheus `/metrics`、TTFT/TPOT/GPU 等指标)
- 内容安全(规则引擎 + 审核模型)
- 日志与追踪(JSON 结构化日志、`request_id`、OTel)

这些能力位于"推理服务接入层",是更大愿景中的一部分。

### 1.2 业务愿景(更新)

Ultralisk 的长期定位是:**面向自建 AI 数据中心的统一管控平台**,帮助企业:

1. 在自有数据中心或私有云内部署 AI 基础设施
2. 通过统一控制台管理硬件、集群、模型服务与推理 API
3. 快速接入现有环境,降低运维复杂度
4. 获得专业的部署实施与托管运维服务

产品形态更贴近 [Chamber](https://www.usechamber.io/)(AIOps / 统一管控),但覆盖范围更广(从硬件到模型服务),并且提供私有化部署 + 服务交付。

### 1.3 当前能力边界(重要)

为避免官网表达与产品现实脱节,必须明确区分:

**已交付能力(Ultralisk Core,已开源)**:
- 鉴权与限流(API Key、QPS、token 配额)
- 可观测性(Prometheus `/metrics`、TTFT/TPOT/GPU 等指标)
- 内容安全(规则引擎 + 审核模型)
- 日志与追踪(JSON 结构化日志、`request_id`、OTel)

**平台愿景(持续演进中)**:
- 硬件与网络纳管
- K8s/Slurm 集群编排
- 模型生命周期管理
- 统一控制台与多租户
- 成本与配额治理

**官网表达策略**:首页和平台页可以呈现全栈愿景,但必须明确标注 Ultralisk Core 是已开源的核心接入层,上层平台能力为路线图或早期版本。避免让用户误以为所有功能已成熟可用。

### 1.4 官网目标

- **营销站**:面向企业决策者、AI infra 负责人、IT/数据中心负责人,传递"全栈、私有化、可控、专业服务"的价值,引导预约演示或联系咨询。
- **文档站**:面向已决定试用或接入的工程师,提供部署、架构、API、运维等技术文档。

---

## 2. 设计原则

1. **在现有基础上扩展,非推倒重来**:保留现有 Astro + Tailwind 4 技术栈,复用 Layout/Header/Footer,但本次是较大改版(新增 5 个页面、1 套 SVG 资产、1 个独立文档站)。
2. **产品感优先于硬件感**:参考 Chamber 的产品展示方式(统一控制台、Before/After、快速部署),而非 Crusoe 的硬件/性能堆砌。
3. **抽象示意,不依赖真实 UI**:当前平台 UI 尚未完成,官网使用 SVG 架构图、控制台概念图、流程图来表达能力,避免露馅。
4. **企业可信**:保留 Zylon 式的合规、私有化、数据不离开等信任元素。
5. **内容可扩展**:页面结构预留客户案例、行业方案、博客等扩展位,但 MVP 不强制填充。

---

## 3. 非目标

- 不做深色模式 MVP(可在后续迭代中添加)
- 不做 3D 动画或复杂视频背景
- 不做多语言 MVP(中文优先)
- 官网不直接承载文档内容,文档通过链接跳转至独立 Starlight 站点
- 不引入外部 CMS,内容直接写在 Astro 文件中

---

## 4. 信息架构

### 4.1 仓库结构

```
Ultralisk/
├── website/                  # 营销站(Astro + Tailwind 4)
│   ├── src/
│   │   ├── components/      # 可复用组件
│   │   ├── layouts/
│   │   ├── pages/
│   │   └── styles/
│   ├── public/
│   └── astro.config.mjs
├── docs-site/               # 文档站(Astro Starlight)
│   ├── astro.config.mjs
│   └── src/content/docs/
└── app/                     # 现有后端
```

### 4.2 营销站页面

| 页面 | 路径 | 核心作用 |
|---|---|---|
| 首页 | `/` | 价值主张 + 全栈能力概览 + CTA |
| 平台 | `/platform` | 分层架构 + 统一控制台概念图 + 六大能力 |
| 解决方案 | `/solutions` | 三大企业场景,每个配 Before/After |
| 服务 | `/services` | 部署、运维、技术支持 + 服务流程 |
| 文档 | `/docs` → 外部/子域跳转 | 进入 Starlight 文档站 |
| 联系我们 | `/contact` | 预约演示/留言表单 |

### 4.3 文档站初始结构

```
docs-site/src/content/docs/
├── index.mdx                  # 文档首页
├── getting-started/
│   ├── index.mdx
│   └── quickstart.mdx
├── architecture/
│   ├── overview.mdx
│   └── ultralisk-core.mdx
├── deployment/
│   ├── index.mdx
│   └── private-data-center.mdx
├── platform/
│   ├── console.mdx
│   ├── cluster-management.mdx
│   └── model-serving.mdx
└── api/
    └── reference.mdx
```

### 4.4 Header/Footer 内容规格

**Header 导航(从左到右)**:
1. Logo + 品牌名 → 首页
2. 平台 → `/platform`
3. 解决方案 → `/solutions`
4. 服务 → `/services`
5. 文档 → 跳转至文档站(链接取决于部署方案)
6. GitHub → 外部链接
7. 联系我们 / 预约演示 → `/contact`(主 CTA 按钮)

**Header 行为**:
- 粘性置顶,滚动时保持背景模糊
- 当前页面高亮
- 移动端:汉堡菜单,包含以上所有链接,支持 Escape 关闭

**Footer 内容(三列或四列)**:
- 第一列:Logo + 品牌简介 + 版权
- 第二列:产品(平台、解决方案、服务、文档)
- 第三列:资源(GitHub、博客预留、状态页预留)
- 第四列:法律(隐私政策预留、服务条款预留、LICENSE)

Footer 保留 MIT License 声明,后续可补充隐私政策与服务条款页面。

---

## 5. 页面设计

### 5.1 首页 `/`

**Hero 区域**

- 主标题:**把自建 AI 数据中心管起来**
- 副标题:统一控制台 · 快速部署 · 私有化可控 · 专业服务
- 主 CTA:预约演示
- 次 CTA:了解平台
- 右侧/下方:抽象平台控制台概念图(卡片式,展示集群/节点/workload 状态)

**Before / After 区域**

- Before:多工具跳来跳去、故障靠人查、扩容手动配、资源利用率不可见
- After:一个控制台、自动发现、统一调度、可视化运维、成本透明

**三大核心能力**

1. **统一控制台**:集群、节点、模型服务一站式管理
2. **快速部署**:已有环境一键接入,新集群标准化交付
3. **私有化可控**:数据不出境,权限/审计/合规内置

**架构简图区域**

- 从"裸金属/GPU" → "集群编排(K8s/Slurm)" → "平台服务" → "推理 API" 的分层图
- 标注 Ultralisk Core 位于"推理接入层"

**CTA 区域**

- 标题:准备好统一管控你的 AI 数据中心了吗?
- CTA:预约演示 + 查看文档

### 5.2 平台页 `/platform`

**Hero 区域**

- 标题:Ultralisk 平台全景
- 副标题:从硬件到推理 API 的分层统一管控

**抽象控制台概念图**(核心视觉)

- 左侧导航:集群 / 节点 / Workload / 模型服务 / 监控 / 安全
- 主区域:资源概览卡片 + 告警列表 + 吞吐量图表
- 使用 SVG + CSS 实现,非真实截图

**六大能力模块**

| 模块 | 说明 | 要点 |
|---|---|---|
| 硬件与网络纳管 | 服务器、GPU、RDMA、存储统一接入 | 自动发现、状态监控、故障告警 |
| 集群编排 | K8s / Slurm 部署与生命周期管理 | 标准化交付、弹性伸缩、资源调度 |
| 模型生命周期 | 模型仓库、版本、部署、灰度 | 模型上线、回滚、多版本并行 |
| 推理服务网关 | Ultralisk Core | 鉴权、限流、安全、监控、日志 |
| 统一可观测性 | 指标、日志、追踪、告警 | Prometheus、Grafana、OTel |
| 成本与配额治理 | 多租户配额、成本分摊、审计 | 按项目/部门配额、用量报告 |

**与 Ultralisk Core 的关系**

- 说明现有开源组件(Ultralisk Core)是平台的核心接入层,负责推理服务的安全暴露
- 可链接到 GitHub 仓库

### 5.3 解决方案页 `/solutions`

三个场景,每个场景包含:

- 场景标题
- 痛点描述
- 方案说明
- 收益总结
- Before/After 对比(文字或简单图示)

**场景 1:已有数据中心,缺统一管控**

- 痛点:多集群、多工具、信息孤岛、排障困难
- 方案:接入 Ultralisk 控制台,统一纳管现有 K8s/Slurm/GPU 资源
- 收益:降低运维复杂度,提升资源利用率,缩短故障定位时间

**场景 2:新建私有 AI 数据中心**

- 痛点:从零搭建技术复杂,交付周期长,团队经验不足
- 方案:标准化交付 + 平台预装 + 专业服务团队支持
- 收益:数周内部署上线,而不是数月

**场景 3:企业多租户 AI 平台**

- 痛点:部门/项目共用 GPU,资源争抢,成本难摊,权限难管
- 方案:配额管理、租户隔离、审计日志、成本分摊
- 收益:安全共享,成本透明,合规就绪

### 5.4 服务页 `/services`

三项服务,每项包含:标题、简介、服务范围、适用场景。

1. **部署实施服务**
   - 需求调研、架构设计、集群交付、平台接入、模型对接
2. **托管运维服务**
   - 7x24 监控、告警响应、容量规划、版本升级、备份恢复
3. **技术支持服务**
   - SLA 支持、专家咨询、故障排查、培训赋能

**服务流程时间线**

1. 评估:了解现状与需求
2. 设计:输出架构与交付方案
3. 部署:平台与集群落地
4. 运维:持续监控与优化

### 5.5 联系我们 `/contact`

- 标题:联系我们
- 表单字段:
  - 姓名(必填)
  - 公司(必填)
  - 邮箱(必填,需格式校验)
  - 电话(可选)
  - 需求描述(必填,最少 10 字)
- 隐私说明:信息仅用于商务沟通
- 提交方式:**静态表单服务**(Formspree / Getform / 等效服务),通过表单 action 提交,无需自建后端
- 表单状态:提交中 / 提交成功 / 提交失败,失败时显示友好提示
- 防机器人:honeypot 字段或验证码(可选,MVP 可延后)
- 企业联系信息(邮箱、电话、地址,可选)

---

## 6. 视觉方向

### 6.1 整体气质

- 干净、专业、技术感、可信赖
- 参考 Chamber 的产品展示逻辑 + Zylon 的企业信任元素
- 避免过度营销感,保留开发者友好气质

### 6.2 色彩

- 主色:保持现有 `brand-600` (#2563EB),扩展 brand-50 ~ brand-950
- 辅助色:slate 系列(slate-50 ~ slate-950)
- 强调色:保持蓝色系,可适度增加绿色(成功/在线)、琥珀色(告警)用于状态指示
- 背景:以白色/浅灰为主,深色区域用于 CTA 或代码片段

### 6.3 字体

- 标题与正文:Inter
- 代码:JetBrains Mono
- 保持不变

### 6.4 图像与图标

- 图标:继续使用 `lucide-astro`
- 插图:SVG 抽象控制台图、架构分层图、流程图
- 不使用真实产品截图
- 不使用 3D 图形或复杂插画

### 6.5 组件风格

- 卡片:圆角 2xl、细边框、轻微阴影
- 按钮:圆角 xl,主 CTA 使用 brand-600,次按钮使用 slate/white
- 标签/徽章:小圆角、轻背景
- 架构图:扁平化、分层、带编号/箭头

### 6.6 SVG 资产交付标准

所有 SVG 插图必须满足:

- **尺寸与 viewBox**:提供明确 `viewBox`,如 `0 0 800 400`,并在容器内响应式缩放
- **颜色**:使用 Tailwind 颜色 token,如 `fill="currentColor"`、`fill="var(--color-brand-600)"`,避免硬编码色值
- **内联方式**:作为 Astro 组件内联(`src/components/diagrams/*.astro`)或 `public/` 下的 SVG 文件,优先内联以便控制主题
- **响应式**:在移动端自动缩放,不出现水平滚动条(必要时简化小屏版本)
- **可访问性**:包含 `<title>` 和 `<desc>` 描述, decorative 图像可设 `aria-hidden="true"`
- **性能**:避免过度复杂的 DOM 节点,单张 SVG 路径数控制在合理范围

具体资产清单:
- `PlatformDiagram.astro`:抽象控制台概念图(左侧导航 + 主内容区)
- `ArchitectureDiagram.astro`:首页/平台页架构分层图
- `ProcessTimeline.astro`:服务流程时间线

---

## 7. 技术实现

### 7.1 营销站

- 框架:Astro 7 + Tailwind CSS 4
- 构建输出:静态(`output: 'static'`)
- 复用现有文件:
  - `src/layouts/Layout.astro`
  - `src/components/Header.astro`
  - `src/components/Footer.astro`
  - `src/styles/global.css`
- 新增组件:
  - `BeforeAfter.astro`
  - `PlatformDiagram.astro`
  - `ArchitectureDiagram.astro`
  - `CapabilityCard.astro`
  - `SolutionCard.astro`
  - `ServiceCard.astro`
  - `ProcessTimeline.astro`
  - `ContactForm.astro`
- SEO 增强:
  - `robots.txt`
  - `sitemap.xml`
  - `<link rel="canonical">`
  - Twitter Card meta
- 可访问性增强:
  - `SkipLink`
  - `:focus-visible` 样式
  - 移动端菜单 `Escape` 关闭
  - 表单 label 与错误提示
- 修复项:
  - QuickStart 复制按钮增加 `try/catch` 回退
  - 确认并修正 GitHub 仓库链接(`nicholasli` vs `nicholasl`)

### 7.2 新增组件 Props 规范

| 组件 | Props | 说明 |
|---|---|---|
| `BeforeAfter` | `before: string[]`, `after: string[]`, `title?: string` | Before/After 文案列表 |
| `PlatformDiagram` | 无 | 抽象控制台 SVG 概念图 |
| `ArchitectureDiagram` | `variant: 'home' \| 'platform'` | 首页简化版 / 平台页完整版 |
| `CapabilityCard` | `icon: Icon`, `title: string`, `description: string`, `points: string[]` | 能力模块卡片 |
| `SolutionCard` | `title: string`, `pain: string`, `solution: string`, `benefit: string` | 解决方案卡片 |
| `ServiceCard` | `title: string`, `description: string`, `items: string[]` | 服务卡片 |
| `ProcessTimeline` | `steps: { title: string, description: string }[]` | 服务流程时间线 |
| `ContactForm` | 无 | 联系表单,内部管理状态 |

所有组件类型安全,Props 使用 TypeScript interface 定义。

### 7.3 SEO 元数据模板

每个页面通过 `Layout.astro` 传入:

```astro
<Layout
  title="页面标题 — Ultralisk"
  description="页面描述,控制在 150 字以内"
/>
```

各页面默认 SEO:

| 页面 | Title | Description |
|---|---|---|
| 首页 | Ultralisk — 把自建 AI 数据中心管起来 | 面向自建 AI 数据中心的统一管控平台,私有化部署、统一控制台、快速部署、专业服务。 |
| 平台 | 平台能力 — Ultralisk | 从硬件到推理 API 的分层统一管控,涵盖集群编排、模型服务、可观测性、成本治理。 |
| 解决方案 | 解决方案 — Ultralisk | 面向已有数据中心、新建私有 AI 中心、企业多租户场景的统一管控解决方案。 |
| 服务 | 服务支持 — Ultralisk | 部署实施、托管运维、技术支持,帮助企业快速落地并持续运营 AI 数据中心。 |
| 联系我们 | 联系我们 — Ultralisk | 预约 Ultralisk 演示,了解如何统一管控自建 AI 数据中心。 |

同时配置:
- `robots.txt`:允许所有爬虫,指向 sitemap
- `sitemap.xml`:包含所有营销页面
- `canonical` link:每页唯一
- OG/Twitter Card:标题、描述、类型、`og:image`(预留,默认使用 logo 或生成图)

### 7.4 404 页面

保留并更新现有 `src/pages/404.astro`:
- 标题:404 — 页面不存在
- 文案:你访问的页面不存在或已被移动。
- CTA:返回首页
- 复用 Header/Footer 和 Layout

### 7.5 文档站

- 框架:Astro Starlight
- 主题:默认主题,调整品牌色与字体以匹配营销站
- 内容格式:Markdown/MDX
- 搜索:Starlight 内置搜索

**部署方案(二选一,开工前确认)**:

| 方案 | 路径 | 优点 | 缺点 |
|---|---|---|---|
| A | 子路径 `ultralisk.dev/docs` | 域名统一,SEO 集中,用户切换无感知 | 需要 monorepo 构建或反向代理配置 |
| B | 子域 `docs.ultralisk.dev` | 两个站点完全独立,部署简单 | 需要 DNS 配置,跨域链接,SEO 分散 |

**已确认采用方案 B(子域)**。两个 Astro 项目独立构建、独立部署,运维最简单。营销站 Header 中的"文档"链接指向 `docs.ultralisk.dev`(或实际部署域名)。后续若需要统一域名,可迁移到方案 A。

---

## 8. 内容计划

### 8.1 MVP 必须完成的内容

- 首页 Hero 文案
- 首页 Before/After 文案
- 首页三大能力文案
- 平台页六大能力模块文案
- 平台页与 Ultralisk Core 关系说明
- 解决方案页三场景文案
- 服务页三项服务文案
- 服务流程文案
- 联系我们页文案

### 8.2 需要设计/绘制的视觉资产

- 抽象控制台概念图(SVG)
- 首页架构分层图(SVG)
- 平台页架构图(SVG)
- 服务流程时间线图示

### 8.3 可延后内容

- 客户 Logo 墙
- 真实客户案例/证言
- 性能数据指标
- 行业细分方案
- 博客
- 多语言
- 定价页

---

## 9. 验收标准

### 9.1 营销站

- [ ] 6 个页面全部可访问且构建无错误
- [ ] 首页包含 Hero、Before/After、三大能力、架构简图、CTA
- [ ] 平台页包含控制台概念图和六大能力模块
- [ ] 解决方案页包含三场景,每个场景有 Before/After
- [ ] 服务页包含三项服务和服务流程
- [ ] 联系页面包含表单或 Calendly 链接
- [ ] 所有页面在移动端正常显示
- [ ] 移动端菜单可正常打开/关闭
- [ ] `robots.txt`、`sitemap.xml`、canonical、OG/Twitter meta 已配置
- [ ] 所有外部链接正确且有效(建议引入构建期链接检查,如 `astro-link-checker` 或 CI 脚本)
- [ ] 404 页面样式与导航一致
- [ ] Lighthouse 性能与可访问性评分 ≥ 85(可通过 `lighthouse-cli` 或 `unlighthouse` 验证)
- [ ] 主流浏览器兼容:Chrome/Firefox/Safari 最新两版,Edge 最新版

### 9.2 文档站

- [ ] Astro Starlight 脚手架搭建完成
- [ ] 至少包含:首页、Quick Start、Architecture Overview、Deployment、API Reference
- [ ] 品牌色与字体与营销站一致
- [ ] 可通过营销站导航进入
- [ ] 构建无错误

---

## 10. 待确认项

1. **GitHub 仓库用户名**:✅ 已确认先占位,后续统一替换。
2. **域名与部署**:✅ 文档站采用**子域**方案(`docs.ultralisk.dev`);营销站域名待定。
3. **联系表单后端**:✅ 使用**静态表单服务**(如 Formspree / Getform)。
4. **合规徽章**:✅ 使用文字描述占位(如"私有化部署 · 数据不出境 · 审计就绪"),**不展示未获得的认证徽章**。
5. **服务范围**:✅ 第一版仅保留**部署实施、托管运维、技术支持**三项。
6. **网站分析**:是否接入 Plausible / umami / Google Analytics / Clarity?若接入,需考虑隐私合规(尤其面向国内/欧洲用户时)。
7. **能力边界表达**:官网是否允许将"全栈数据中心平台"作为愿景呈现,同时明确区分已交付的 Ultralisk Core?还是必须等更多平台功能实现后再推广?
8. **SVG 视觉资产来源**:是否有设计师提供线框或参考图,还是由前端工程师自行绘制?

---

## 11. 后续步骤

1. 用户确认本设计文档
2. 使用 `writing-plans` skill 制定分阶段实现计划
3. 按优先级分批次开发页面与文档站
4. 每完成一个页面进行构建与可访问性检查
5. 全部完成后部署上线

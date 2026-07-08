# Ultralisk 官网改版实现计划

> **For agentic workers:** REQUIRED SUB-TOOL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Ultralisk 单页营销站扩展为 5-6 页的企业级官网,同时新增 Astro Starlight 文档站,明确区分已交付的 Ultralisk Core 与平台愿景。

**架构:** 保留现有 Astro 7 + Tailwind CSS 4 营销站,复用 Layout/Header/Footer;新增独立 `docs-site/` 目录运行 Astro Starlight,通过子域部署;所有页面静态输出,支持任意静态托管。

**Tech Stack:** Astro 7, Tailwind CSS 4, lucide-astro, TypeScript, Astro Starlight

---

## 文件结构

### 营销站 `website/`

```
website/
├── public/
│   ├── robots.txt                 # 新增
│   └── sitemap-index.xml          # 可选,若文档站独立子域
├── src/
│   ├── components/
│   │   ├── Header.astro           # 修改:导航、移动端 Escape
│   │   ├── Footer.astro           # 修改:多列链接
│   │   ├── SkipLink.astro         # 新增
│   │   ├── CapabilityCard.astro   # 新增
│   │   ├── SolutionCard.astro     # 新增
│   │   ├── ServiceCard.astro      # 新增
│   │   ├── BeforeAfter.astro      # 新增
│   │   ├── ProcessTimeline.astro  # 新增
│   │   └── diagrams/
│   │       ├── ArchitectureDiagram.astro  # 新增
│   │       └── PlatformDiagram.astro      # 新增
│   ├── layouts/
│   │   └── Layout.astro           # 修改:SEO meta、Twitter Card
│   ├── pages/
│   │   ├── index.astro            # 重写
│   │   ├── platform.astro         # 新增
│   │   ├── solutions.astro        # 新增
│   │   ├── services.astro         # 新增
│   │   ├── contact.astro          # 新增
│   │   └── 404.astro              # 修改
│   └── styles/
│       └── global.css             # 修改:focus-visible、SkipLink
├── astro.config.mjs               # 修改:site、sitemap 插件
└── package.json                   # 修改:新增 astrojs/sitemap
```

### 文档站 `docs-site/`

```
docs-site/
├── astro.config.mjs               # 新增
├── package.json                   # 新增
├── tsconfig.json                  # 新增
└── src/
    ├── assets/
    │   └── logo.svg               # 从 website/public 复制或链接
    └── content/
        └── docs/
            ├── index.mdx          # 文档首页
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

---

## Phase 0: 基础修复与 SEO

### Task 0.1: 更新 Layout.astro 增强 SEO

**Files:**
- Modify: `website/src/layouts/Layout.astro`

- [ ] **Step 1: 扩展 Props 接口,增加 SEO 字段**

```astro
---
export interface Props {
  title?: string;
  description?: string;
  image?: string;
  noindex?: boolean;
}

const {
  title = 'Ultralisk — 把自建 AI 数据中心管起来',
  description = '面向自建 AI 数据中心的统一管控平台,私有化部署、统一控制台、快速部署、专业服务。',
  image = '/logo.svg',
  noindex = false
} = Astro.props;

const canonicalURL = new URL(Astro.url.pathname, Astro.site);
---
```

- [ ] **Step 2: 在 `<head>` 中添加 canonical、Twitter Card、额外 meta**

```astro
<link rel="canonical" href={canonicalURL} />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={new URL(image, Astro.site)} />
<meta property="og:image" content={new URL(image, Astro.site)} />
{noindex && <meta name="robots" content="noindex" />}
```

- [ ] **Step 3: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds, no errors.

---

### Task 0.2: 添加 robots.txt 与 Sitemap

**Files:**
- Create: `website/public/robots.txt`
- Modify: `website/astro.config.mjs`
- Modify: `website/package.json`

- [ ] **Step 1: 安装 sitemap 插件**

Run:
```bash
cd website && npm install @astrojs/sitemap
```

- [ ] **Step 2: 更新 astro.config.mjs**

```js
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://ultralisk.dev',
  base: '/',
  vite: { plugins: [tailwindcss()] },
  outDir: './dist',
  build: { format: 'directory' },
  integrations: [sitemap()]
});
```

- [ ] **Step 3: 创建 robots.txt**

```txt
User-agent: *
Allow: /

Sitemap: https://ultralisk.dev/sitemap-index.xml
```

- [ ] **Step 4: 构建并验证 sitemap 生成**

Run:
```bash
cd website && npm run build && ls dist/sitemap-index.xml
```
Expected: `dist/sitemap-index.xml` exists.

---

### Task 0.3: 修复 Header 可访问性与导航

**Files:**
- Modify: `website/src/components/Header.astro`

- [ ] **Step 1: 更新导航链接为 5-6 页结构**

```astro
import { Github } from 'lucide-astro';

const navLinks = [
  { label: '平台', href: '/platform' },
  { label: '解决方案', href: '/solutions' },
  { label: '服务', href: '/services' },
  { label: '文档', href: 'https://docs.ultralisk.dev', external: true },
];
```

Header 从左到右完整结构:
1. Logo + 品牌名 → 首页
2. 平台 → `/platform`
3. 解决方案 → `/solutions`
4. 服务 → `/services`
5. 文档 → `https://docs.ultralisk.dev`
6. GitHub 图标链接 → `https://github.com/0xnicholas/Ultralisk`
7. 联系我们 / 预约演示 CTA 按钮 → `/contact`

移动端菜单包含以上所有链接。

- [ ] **Step 2: 为当前页面添加高亮逻辑**

```astro
const currentPath = Astro.url.pathname;
```

并在链接 class 中判断 `currentPath.startsWith(href)` 添加激活样式。

- [ ] **Step 3: 添加 Escape 键关闭移动端菜单**

```js
<script>
  // existing button/menu code
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
      menu.classList.add('hidden');
      openIcon.classList.remove('hidden');
      closeIcon.classList.add('hidden');
      button.setAttribute('aria-expanded', 'false');
    }
  });
</script>
```

- [ ] **Step 4: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 0.4: 更新 Footer

**Files:**
- Modify: `website/src/components/Footer.astro`

- [ ] **Step 1: 扩展 Footer 为多列结构**

内容按 SPEC 4.4 定义:品牌简介、产品、资源、法律四列。

- [ ] **Step 2: GitHub 链接占位处理**

```astro
const GITHUB_URL = 'https://github.com/0xnicholas/Ultralisk';
```

并添加 TODO 注释说明后续替换。

- [ ] **Step 3: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 0.5: 修复 QuickStart 复制按钮

**Files:**
- Modify: `website/src/components/QuickStart.astro`

- [ ] **Step 1: 为复制逻辑添加 try/catch 回退**

```js
button.addEventListener('click', async () => {
  const code = button.getAttribute('data-code') || '';
  try {
    await navigator.clipboard.writeText(code);
  } catch (err) {
    // Fallback: select and copy
    const textarea = document.createElement('textarea');
    textarea.value = code;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
  // existing icon/text toggle logic
});
```

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 0.6: 添加 SkipLink 与焦点样式

**Files:**
- Create: `website/src/components/SkipLink.astro`
- Modify: `website/src/layouts/Layout.astro`
- Modify: `website/src/styles/global.css`

- [ ] **Step 1: 创建 SkipLink 组件**

```astro
<a
  href="#main-content"
  class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-white"
>
  跳到主要内容
</a>
```

- [ ] **Step 2: 在 Layout 中引入 SkipLink,并为 main 添加 id**

```astro
<body class="min-h-screen flex flex-col">
  <SkipLink />
  <slot />
</body>
```

并在 `Layout.astro` 或各页面为 `<main>` 添加 `id="main-content"`。

- [ ] **Step 3: 在 global.css 添加 focus-visible 样式**

```css
@layer base {
  *:focus-visible {
    outline: 2px solid var(--color-brand-600);
    outline-offset: 2px;
  }
}
```

- [ ] **Step 4: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 0.7: 清理旧组件

**Files:**
- Delete: `website/src/components/Hero.astro`
- Delete: `website/src/components/Features.astro`
- Delete: `website/src/components/Architecture.astro`
- Delete: `website/src/components/QuickStart.astro`

- [ ] **Step 1: 确认 index.astro 重写后不再引用旧组件**

- [ ] **Step 2: 删除旧组件文件**

Run:
```bash
cd website/src/components
rm Hero.astro Features.astro Architecture.astro QuickStart.astro
```

- [ ] **Step 3: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

## Phase 1: 共享组件

### Task 1.1: CapabilityCard 组件

**Files:**
- Create: `website/src/components/CapabilityCard.astro`

- [ ] **Step 1: 实现组件**

```astro
---
export interface Props {
  icon: any;
  title: string;
  description: string;
  points: string[];
}

const { icon: Icon, title, description, points } = Astro.props;
---

<div class="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
  <div class="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors">
    <Icon class="h-6 w-6" />
  </div>
  <h3 class="mt-5 text-xl font-semibold text-slate-900">{title}</h3>
  <p class="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
  <ul class="mt-4 space-y-2">
    {points.map((point) => (
      <li class="flex items-start gap-2 text-sm text-slate-500">
        <span class="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500"></span>
        {point}
      </li>
    ))}
  </ul>
</div>
```

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.2: SolutionCard 组件

**Files:**
- Create: `website/src/components/SolutionCard.astro`

- [ ] **Step 1: 实现组件,包含 Before/After 结构**

Props:
- `title: string`
- `pain: string`
- `solution: string`
- `benefit: string`

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.3: ServiceCard 组件

**Files:**
- Create: `website/src/components/ServiceCard.astro`

- [ ] **Step 1: 实现组件**

Props:
- `title: string`
- `description: string`
- `items: string[]`

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.4: BeforeAfter 组件

**Files:**
- Create: `website/src/components/BeforeAfter.astro`

- [ ] **Step 1: 实现两栏对比组件**

Props:
- `before: string[]`
- `after: string[]`
- `title?: string`

左侧灰底显示 Before 列表,右侧 brand 色调显示 After 列表。

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.5: ProcessTimeline 组件

**Files:**
- Create: `website/src/components/ProcessTimeline.astro`

- [ ] **Step 1: 实现横向/纵向时间线**

Props:
- `steps: { title: string; description: string }[]`

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.6: ArchitectureDiagram 组件

**Files:**
- Create: `website/src/components/diagrams/ArchitectureDiagram.astro`

- [ ] **Step 1: 实现 SVG 分层架构图**

包含四层:
1. 裸金属/GPU
2. 集群编排(K8s/Slurm)
3. 平台服务
4. 推理 API / Ultralisk Core

使用 SVG + Tailwind 颜色 token,`variant` prop 控制首页简化版或平台页完整版。

SVG 标准检查清单:
- [ ] 提供明确 `viewBox`
- [ ] 使用 Tailwind 颜色 token 或 `currentColor`
- [ ] 包含 `<title>` 和 `<desc>`
- [ ] 在移动端可缩放,无水平滚动
- [ ] 控制路径数量,避免过度复杂

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.7: PlatformDiagram 组件

**Files:**
- Create: `website/src/components/diagrams/PlatformDiagram.astro`

- [ ] **Step 1: 实现抽象控制台概念图**

左侧导航(集群/节点/Workload/模型服务/监控/安全),右侧主区域(资源卡片/告警/图表)。

SVG 标准检查清单:
- [ ] 提供明确 `viewBox`
- [ ] 使用 Tailwind 颜色 token 或 `currentColor`
- [ ] 包含 `<title>` 和 `<desc>`
- [ ] 在移动端可缩放,无水平滚动
- [ ] 控制路径数量,避免过度复杂

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

### Task 1.8: ContactForm 组件

**Files:**
- Create: `website/src/components/ContactForm.astro`

- [ ] **Step 1: 实现表单结构与校验**

```astro
<form action="https://formspree.io/f/PLACEHOLDER" method="POST" class="space-y-4">
  <input type="text" name="name" required placeholder="姓名" />
  <input type="text" name="company" required placeholder="公司" />
  <input type="email" name="email" required placeholder="邮箱" />
  <input type="tel" name="phone" placeholder="电话(可选)" />
  <textarea name="message" required minlength="10" placeholder="需求描述"></textarea>
  <button type="submit">提交</button>
</form>
```

- [ ] **Step 2: 添加提交状态反馈与 honeypot**

添加隐藏 honeypot 字段防止简单爬虫:

```astro
<input type="text" name="_gotcha" style="display:none" />
```

- [ ] **Step 3: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

## Phase 2: 营销页面

### Task 2.1: 重写首页 `/`

**Files:**
- Modify: `website/src/pages/index.astro`

- [ ] **Step 1: 导入所有需要的组件并设置 SEO**

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import BeforeAfter from '../components/BeforeAfter.astro';
import ArchitectureDiagram from '../components/diagrams/ArchitectureDiagram.astro';
import { ArrowRight, Zap } from 'lucide-astro';
---

<Layout
  title="Ultralisk — 把自建 AI 数据中心管起来"
  description="面向自建 AI 数据中心的统一管控平台,私有化部署、统一控制台、快速部署、专业服务。"
>
```

- [ ] **Step 2: 实现 Hero 区域**

标题:"把自建 AI 数据中心管起来"
副标题:"统一控制台 · 快速部署 · 私有化可控 · 专业服务"
CTA:预约演示 + 了解平台

- [ ] **Step 3: 实现 Before/After 区域**

使用 `BeforeAfter` 组件。

- [ ] **Step 4: 实现三大核心能力区域**

三个能力卡片:统一控制台、快速部署、私有化可控。

- [ ] **Step 5: 添加企业信任元素**

在 Hero 下方或三大能力上方添加文字标签:
"私有化部署 · 数据不出境 · 审计就绪"

- [ ] **Step 6: 实现架构简图区域**

使用 `ArchitectureDiagram variant="home"`。

- [ ] **Step 7: 实现 CTA 区域与 Footer**

- [ ] **Step 8: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds, `/` renders correctly.

---

### Task 2.2: 创建平台页 `/platform`

**Files:**
- Create: `website/src/pages/platform.astro`

- [ ] **Step 1: 实现 Hero 与 SEO**

```astro
<Layout
  title="平台能力 — Ultralisk"
  description="从硬件到推理 API 的分层统一管控,涵盖集群编排、模型服务、可观测性、成本治理。"
>
```

标题:"Ultralisk 平台全景"
副标题:"从硬件到推理 API 的分层统一管控"

- [ ] **Step 2: 添加 PlatformDiagram**

- [ ] **Step 3: 添加六大能力模块**

使用 `CapabilityCard` 组件,六个模块:
1. 硬件与网络纳管
2. 集群编排
3. 模型生命周期
4. 推理服务网关(Ultralisk Core)
5. 统一可观测性
6. 成本与配额治理

- [ ] **Step 4: 添加 Ultralisk Core 关系说明**

明确标注现有开源组件是平台的核心接入层。

- [ ] **Step 5: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: `/platform/index.html` exists.

---

### Task 2.3: 创建解决方案页 `/solutions`

**Files:**
- Create: `website/src/pages/solutions.astro`

- [ ] **Step 1: 实现 Hero 与 SEO**

```astro
<Layout
  title="解决方案 — Ultralisk"
  description="面向已有数据中心、新建私有 AI 中心、企业多租户场景的统一管控解决方案。"
>
```

- [ ] **Step 2: 添加三个 SolutionCard**

1. 已有数据中心,缺统一管控
2. 新建私有 AI 数据中心
3. 企业多租户 AI 平台

- [ ] **Step 3: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: `/solutions/index.html` exists.

---

### Task 2.4: 创建服务页 `/services`

**Files:**
- Create: `website/src/pages/services.astro`

- [ ] **Step 1: 实现 Hero 与 SEO**

```astro
<Layout
  title="服务支持 — Ultralisk"
  description="部署实施、托管运维、技术支持,帮助企业快速落地并持续运营 AI 数据中心。"
>
```

- [ ] **Step 2: 添加三个 ServiceCard**

1. 部署实施服务
2. 托管运维服务
3. 技术支持服务

- [ ] **Step 3: 添加 ProcessTimeline**

流程:评估 → 设计 → 部署 → 运维

- [ ] **Step 4: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: `/services/index.html` exists.

---

### Task 2.5: 创建联系页 `/contact`

**Files:**
- Create: `website/src/pages/contact.astro`

- [ ] **Step 1: 实现 Hero、SEO 与说明文字**

```astro
<Layout
  title="联系我们 — Ultralisk"
  description="预约 Ultralisk 演示,了解如何统一管控自建 AI 数据中心。"
>
```

- [ ] **Step 2: 嵌入 ContactForm**

- [ ] **Step 3: 添加企业联系信息占位**

- [ ] **Step 4: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: `/contact/index.html` exists.

---

### Task 2.6: 更新 404 页面

**Files:**
- Modify: `website/src/pages/404.astro`

- [ ] **Step 1: 确保复用 Header/Footer/Layout 和 SkipLink**

- [ ] **Step 2: 调整文案与 CTA**

保持现有文案:"页面不存在或已被移动",CTA"返回首页"。

- [ ] **Step 3: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: `/404.html` exists.

---

## Phase 3: 文档站

### Task 3.1: 初始化 Astro Starlight

**Files:**
- Create: `docs-site/` directory and files

- [ ] **Step 1: 在仓库根目录初始化 Starlight**

Run:
```bash
cd /Users/nicholasl/Documents/build-whatever/Ultralisk
npm create astro@latest -- --template starlight docs-site
```

按提示选择 TypeScript、安装依赖。

注意:`docs-site/` 作为独立 npm 包管理,有自己的 `package.json` 和 `node_modules`。这与营销站完全解耦,便于独立部署,但需分别维护依赖。若后续希望统一锁文件,可改为 pnpm workspace 或 npm workspace。

- [ ] **Step 2: 构建验证**

Run:
```bash
cd docs-site && npm run build
```
Expected: Build succeeds.

---

### Task 3.2: 配置 Starlight 品牌

**Files:**
- Modify: `docs-site/astro.config.mjs`
- Create/Copy: `docs-site/src/assets/logo.svg`

- [ ] **Step 1: 更新站点配置**

```js
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.ultralisk.dev',
  integrations: [
    starlight({
      title: 'Ultralisk',
      logo: { src: './src/assets/logo.svg' },
      social: {
        github: 'https://github.com/0xnicholas/Ultralisk',
      },
      sidebar: [
        { label: 'Getting Started', items: [
          { label: 'Overview', slug: 'getting-started' },
          { label: 'Quick Start', slug: 'getting-started/quickstart' },
        ]},
        { label: 'Architecture', items: [
          { label: 'Overview', slug: 'architecture/overview' },
          { label: 'Ultralisk Core', slug: 'architecture/ultralisk-core' },
        ]},
        { label: 'Deployment', items: [
          { label: 'Overview', slug: 'deployment' },
          { label: 'Private Data Center', slug: 'deployment/private-data-center' },
        ]},
        { label: 'Platform', items: [
          { label: 'Console', slug: 'platform/console' },
          { label: 'Cluster Management', slug: 'platform/cluster-management' },
          { label: 'Model Serving', slug: 'platform/model-serving' },
        ]},
        { label: 'API Reference', slug: 'api/reference' },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
```

- [ ] **Step 2: 创建自定义 CSS 匹配营销站品牌**

Create `docs-site/src/styles/custom.css`:

```css
:root {
  --sl-color-accent: #2563eb;
  --sl-color-accent-high: #1d4ed8;
}
```

- [ ] **Step 3: 复制 logo**

Run:
```bash
cp website/public/logo.svg docs-site/src/assets/logo.svg
```

- [ ] **Step 4: 构建验证**

Run:
```bash
cd docs-site && npm run build
```
Expected: Build succeeds with custom branding.

---

### Task 3.3: 创建初始文档内容

**Files:**
- Create: all `.mdx` files under `docs-site/src/content/docs/`

- [ ] **Step 1: 创建文档首页 `index.mdx`**

```mdx
---
title: Ultralisk 文档
description: Ultralisk 平台文档首页
---

Ultralisk 是面向自建 AI 数据中心的统一管控平台。

本站点包含部署指南、架构说明、API 参考与运维文档。
```

- [ ] **Step 2: 创建 Getting Started 内容**

`getting-started/index.mdx` 和 `getting-started/quickstart.mdx`,内容可从现有 README 和 website QuickStart 迁移。

- [ ] **Step 3: 创建 Architecture 内容**

`architecture/overview.mdx` 和 `architecture/ultralisk-core.mdx`,说明平台分层与 Ultralisk Core 已交付能力。

- [ ] **Step 4: 创建 Deployment 内容**

`deployment/index.mdx` 和 `deployment/private-data-center.mdx`,说明私有化部署流程。

- [ ] **Step 5: 创建 Platform 内容**

`platform/console.mdx`、`cluster-management.mdx`、`model-serving.mdx`,内容为占位 + 路线图说明。

- [ ] **Step 6: 创建 API Reference**

`api/reference.mdx`,迁移现有 API 文档或指向 OpenAPI schema。

- [ ] **Step 7: 构建验证**

Run:
```bash
cd docs-site && npm run build
```
Expected: Build succeeds, all pages generated.

---

### Task 3.4: 更新营销站文档链接

**Files:**
- Modify: `website/src/components/Header.astro`
- Modify: `website/src/components/Footer.astro`

- [ ] **Step 1: 确保所有"文档"链接指向 `https://docs.ultralisk.dev`**

- [ ] **Step 2: 构建验证**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds.

---

## Phase 4: 打磨与验证

### Task 4.1: 全量构建验证

**Files:**
- All modified files

- [ ] **Step 1: 构建营销站**

Run:
```bash
cd website && npm run build
```
Expected: Build succeeds, `dist/` contains index.html, platform/index.html, solutions/index.html, services/index.html, contact/index.html, 404.html.

- [ ] **Step 2: 构建文档站**

Run:
```bash
cd docs-site && npm run build
```
Expected: Build succeeds, `dist/` contains all docs pages.

---

### Task 4.2: Lighthouse 检查

**Files:**
- N/A (verification task)

- [ ] **Step 1: 对首页运行 Lighthouse**

Run:
```bash
cd website
npm run build
npm run preview -- --port 4321 &
npx lighthouse http://localhost:4321 --output=json --output-path=./lighthouse-report.json
```

Expected: Performance / Accessibility / Best Practices / SEO 均 ≥ 85。

注意:若域名仍为 `ultralisk.dev` 占位,外部链接(docs、GitHub)可能无法解析,检查时跳过外部链接或针对 staging 域名运行。

- [ ] **Step 3: 若分数不足,定位并修复**

常见问题:图片无尺寸、缺少 alt、CLS 过高、robots 配置错误。

---

### Task 4.3: 链接检查

**Files:**
- N/A (verification task)

- [ ] **Step 1: 安装链接检查工具**

Run:
```bash
cd website && npm install -D astro-link-checker
```

并按插件文档配置到 `astro.config.mjs`。

- [ ] **Step 2: 在构建时自动检查链接**

Run:
```bash
cd website && npm run build
```

Expected: 构建输出中无内部死链警告。

- [ ] **Step 3: 手动抽查外部链接**

重点检查:docs.ultralisk.dev、GitHub、Formspree action URL。

Expected: 无 404 内部链接,外部链接指向正确域名。

---

### Task 4.4: 移动端与可访问性手动检查

**Files:**
- N/A (verification task)

- [ ] **Step 1: 使用浏览器 DevTools 测试移动端视图**

检查:
- iPhone SE / 12 Pro / Pixel 5
- 导航菜单正常展开/关闭
- 表单输入可用
- 无水平滚动条

- [ ] **Step 2: 键盘导航测试**

检查:
- Tab 顺序合理
- SkipLink 可用
- 所有交互元素可通过键盘操作
- 焦点可见

- [ ] **Step 3: 屏幕阅读器测试(可选)**

使用 macOS VoiceOver 或 NVDA 快速验证标题结构和 landmarks。

---

## 部署准备

### Task 5.1: 准备营销站部署

**Files:**
- `website/dist/`

- [ ] **Step 1: 确认域名与 base 路径**

如果最终域名不是 `ultralisk.dev`,更新 `website/astro.config.mjs` 中的 `site`。

- [ ] **Step 2: 上传 `website/dist/` 到静态托管**

可选:Cloudflare Pages / Vercel / Netlify / GitHub Pages / Nginx。

---

### Task 5.2: 准备文档站部署

**Files:**
- `docs-site/dist/`

- [ ] **Step 1: 配置 `docs.ultralisk.dev` DNS**

- [ ] **Step 2: 上传 `docs-site/dist/` 到对应子域托管**

- [ ] **Step 3: 验证营销站文档链接可正常跳转**

---

### Task 5.3: 上线前检查清单

**Files:**
- N/A (verification task)

- [ ] **Step 1: 替换所有占位符**

- [ ] GitHub 链接:`PLACEHOLDER` → 真实用户名/组织
- [ ] Formspree endpoint:`PLACEHOLDER` → 真实表单 ID
- [ ] 域名:`ultralisk.dev` → 真实域名(如需要)
- [ ] 企业联系信息:邮箱、电话、地址

- [ ] **Step 2: 验证 robots.txt 与 sitemap**

Run:
```bash
cd website && npm run build
ls dist/robots.txt dist/sitemap-index.xml
```

Expected: 两个文件均存在,sitemap 包含所有营销页面 URL。

- [ ] **Step 3: 验证 canonical 与 OG 标签**

检查首页 HTML:
```bash
grep -E 'rel="canonical"|property="og:' dist/index.html | head -10
```

Expected: canonical URL 为绝对路径,OG title/description/image 存在。

- [ ] **Step 4: 最终全量构建**

```bash
cd website && npm run build
cd ../docs-site && npm run build
```

Expected: 两个站点均构建成功。

---

## 文档与交付物

完成实现后应存在:

1. 营销站 6 个页面全部可用
2. 文档站 Starlight 初始化并包含初始内容
3. `website/public/robots.txt` 与 `sitemap-index.xml`
4. 所有页面 SEO meta 完整
5. Lighthouse 评分 ≥ 85
6. 无失效内部链接

---

## 风险与回滚

| 风险 | 缓解措施 |
|---|---|
| SVG 图表设计返工 | 先用占位矩形框实现,确认结构后再细化样式 |
| Starlight 与营销站样式不一致 | 通过 customCss 同步品牌色与字体 |
| 表单服务无法访问 | 保留 Calendly 作为备选方案 |
| 构建失败 | 每完成一个 Task 立即构建验证 |
| 过度承诺产品能力 | 严格按 SPEC 能力边界表达,区分 Ultralisk Core 与平台愿景 |

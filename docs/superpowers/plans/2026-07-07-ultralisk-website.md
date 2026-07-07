# Ultralisk Official Website — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v0.1 marketing-leaning website for Ultralisk (5 pages, Astro 7 + Tailwind v4 + MDX, Cloudflare Pages) per the design spec at `docs/superpowers/specs/2026-07-07-ultralisk-website-design.md`.

**Architecture:** Astro 7 static site at repo-root `website/` directory. Content lives in Astro Content Collections (`src/content/*.md`); pages are thin Astro wrappers (`src/pages/*.astro`) that import content via `getEntry()`. 8 reusable components in `src/components/`. Visual system via Tailwind v4 CSS-first `@theme` tokens in `src/styles/global.css`. SVG illustrations are inline in components, not external assets. Deploy target: Cloudflare Pages (GitHub auto-build).

**Tech Stack:** Astro 7 · Tailwind v4 · MDX · TypeScript · `@astrojs/sitemap` · `@fontsource/inter` + `@fontsource/jetbrains-mono` · Cloudflare Pages · Node ≥ 20.3.0

**Reference:** All design decisions are in the spec. This plan is mechanical execution of that spec. When in doubt, the spec wins.

---

## How to use this plan

- Each task is **self-contained** — produces a commit and verifiable state.
- Each task ends with **Verify** + **Commit** steps. Don't skip.
- **OC items** (§9 of spec): Architecture sub-paragraph (OC1), Module 1-line claims (OC2), Module bullets (OC3), Meta descriptions (OC4) — implementer uses the suggested drafts from the spec as starting copy. Flag for owner review at the end of the relevant task; owner may amend before merging.
- **TDD note:** This is a marketing site, not a library — there are no unit tests. "Tests" are: `astro build` succeeds, `astro dev` renders all 5 routes, Lighthouse scores meet §8 acceptance criteria, and visual review of each page. Each task ends with a verification step.

---

## Phase 0 — Project Bootstrap

### Task 0.1: Create empty `website/` directory and `.gitignore`

**Files:**
- Create: `website/.gitignore`
- Create: `website/README.md`

- [ ] **Step 1: Create directory**

```bash
mkdir -p website
```

- [ ] **Step 2: Write `website/.gitignore`**

```
node_modules/
dist/
.astro/
.env
.env.production
.DS_Store
*.log
```

- [ ] **Step 3: Write `website/README.md`** (minimal placeholder, will expand in Task 7.3)

```markdown
# Ultralisk Website

Marketing site for [Ultralisk](https://github.com/nicholasli/ultralisk). Built with Astro 7 + Tailwind v4.

## Development

```bash
npm install
npm run dev
```

Site runs at http://localhost:4321.

See [`docs/superpowers/specs/2026-07-07-ultralisk-website-design.md`](../specs/2026-07-07-ultralisk-website-design.md) for the design spec.
```

- [ ] **Step 4: Verify**

```bash
ls -la website/
cat website/.gitignore
```

Expected: `node_modules/`, `dist/`, etc. listed; README present.

- [ ] **Step 5: Commit**

```bash
cd website && git init && cd ..
# Note: website/ is a subdirectory of the parent repo, NOT a separate git repo.
# Do NOT `git init` inside website/. Remove the .git if it was created.
rm -rf website/.git
git add website/.gitignore website/README.md
git commit -m "chore(website): bootstrap empty directory with .gitignore + placeholder README"
```

### Task 0.2: Initialize Astro 7 project manually

**Files:**
- Create: `website/package.json`
- Create: `website/tsconfig.json`
- Create: `website/astro.config.mjs`

- [ ] **Step 1: Write `website/package.json`**

```json
{
  "name": "ultralisk-website",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20.3.0"
  },
  "scripts": {
    "dev": "astro dev",
    "start": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro"
  },
  "dependencies": {
    "astro": "^7.0.6",
    "@astrojs/mdx": "^7.0.2",
    "@astrojs/sitemap": "^3.2.1",
    "@astrojs/cloudflare": "^14.1.1",
    "@tailwindcss/vite": "^4.3.2",
    "tailwindcss": "^4.3.2",
    "@fontsource/inter": "^5.2.8",
    "@fontsource/jetbrains-mono": "^5.2.8"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Write `website/tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 3: Write `website/astro.config.mjs`**

```javascript
// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://ultralisk.pages.dev',
  output: 'static',
  adapter: cloudflare(),
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Preserve whitespace in <pre> blocks (don't strip the Quickstart code).
  compressHTML: false,
});
```

- [ ] **Step 4: Install dependencies**

```bash
cd website
npm install
```

Expected: `node_modules/` populated, no errors. May take 1–2 minutes.

- [ ] **Step 5: Verify**

```bash
cd website && npx astro --version
```

Expected: `astro/7.x.x`

- [ ] **Step 6: Commit**

```bash
cd ..  # back to repo root
git add website/package.json website/package-lock.json website/tsconfig.json website/astro.config.mjs
git commit -m "chore(website): initialize Astro 7 + MDX + Tailwind v4 + sitemap + Cloudflare"
```

---

## Phase 1 — Visual System Foundation

### Task 1.1: Set up Tailwind v4 CSS-first theme tokens

**Files:**
- Create: `website/src/styles/global.css`

- [ ] **Step 1: Create styles directory**

```bash
mkdir -p website/src/styles
```

- [ ] **Step 2: Write `website/src/styles/global.css`**

```css
@import "tailwindcss";

/* Design tokens (per spec §4.1) */
@theme {
  --color-bg-primary: #0B0E14;
  --color-bg-surface: #11151C;
  --color-border-default: #1F2937;
  --color-text-primary: #E5E7EB;
  --color-text-secondary: #94A3B8;
  --color-accent: #06B6D4;
  --color-accent-hover: #22D3EE;
  --color-success: #10B981;

  /* Typography (per spec §4.2) */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Spacing scale (4px base, 8px major per spec §4.3) */
  --spacing: 0.25rem;
}

/* Base styles */
html {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

body {
  min-height: 100vh;
}

/* Subtle background pattern on hero (per spec §3.4.1 #1) */
.hero-bg {
  background-image:
    radial-gradient(circle at 20% 50%, rgba(6, 182, 212, 0.04) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(6, 182, 212, 0.03) 0%, transparent 40%);
}
```

- [ ] **Step 3: Verify**

```bash
cd website && cat src/styles/global.css | head -5
```

Expected: `@import "tailwindcss";` is the first line.

- [ ] **Step 4: Commit**

```bash
cd ..
git add website/src/styles/global.css
git commit -m "feat(website): Tailwind v4 CSS-first theme tokens + base styles"
```

### Task 1.2: Load self-hosted fonts

**Files:**
- Modify: `website/src/styles/global.css`

- [ ] **Step 1: Add font imports at the top of `global.css`** (before `@import "tailwindcss";`)

```css
@import "@fontsource/inter/400.css";
@import "@fontsource/inter/600.css";
@import "@fontsource/inter/700.css";
@import "@fontsource/jetbrains-mono/400.css";

@import "tailwindcss";

/* ... rest unchanged */
```

- [ ] **Step 2: Verify**

```bash
cd website && ls node_modules/@fontsource/inter/ | head -5
```

Expected: `400.css`, `600.css`, `700.css` files present.

- [ ] **Step 3: Build to verify fonts don't break**

```bash
cd website && npx astro build 2>&1 | tail -10
```

Expected: build completes without errors related to fonts.

- [ ] **Step 4: Commit**

```bash
cd ..
git add website/src/styles/global.css
git commit -m "feat(website): load self-hosted Inter + JetBrains Mono via @fontsource"
```

---

## Phase 2 — Base Layout & Navigation

### Task 2.1: Create `BaseLayout.astro` with named `head` slot

**Files:**
- Create: `website/src/layouts/BaseLayout.astro`

- [ ] **Step 1: Create layouts directory**

```bash
mkdir -p website/src/layouts
```

- [ ] **Step 2: Write `website/src/layouts/BaseLayout.astro`**

```astro
---
import '../styles/global.css';

export interface Props {
  title: string;
  description: string;
}

const { title, description } = Astro.props;
const navLinks = [
  { href: '/architecture', label: 'Architecture' },
  { href: '/modules', label: 'Modules' },
  { href: '/quickstart', label: 'Quickstart' },
  { href: '/about', label: 'About' },
];
---

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>{title} · Ultralisk</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={`${title} · Ultralisk`} />
    <meta property="og:description" content={description} />
    <meta property="og:image" content="/og-image.png" />
    <meta property="og:type" content="website" />
    <slot name="head" />
  </head>
  <body>
    <slot />
  </body>
</html>
```

- [ ] **Step 3: Verify file**

```bash
cat website/src/layouts/BaseLayout.astro | head -10
```

Expected: TypeScript frontmatter with Props interface, then `<!DOCTYPE html>`.

- [ ] **Step 4: Commit**

```bash
git add website/src/layouts/BaseLayout.astro
git commit -m "feat(website): BaseLayout with named head slot + global meta tags"
```

### Task 2.2: Create `Nav.astro` component

**Files:**
- Create: `website/src/components/Nav.astro`

- [ ] **Step 1: Create components directory**

```bash
mkdir -p website/src/components
```

- [ ] **Step 2: Write `website/src/components/Nav.astro`**

```astro
---
const navLinks = [
  { href: '/architecture', label: 'Architecture' },
  { href: '/modules', label: 'Modules' },
  { href: '/quickstart', label: 'Quickstart' },
  { href: '/about', label: 'About' },
];
const currentPath = Astro.url.pathname;
---

<nav class="sticky top-0 z-50 backdrop-blur-md bg-[#0B0E14]/80 border-b border-[#1F2937]">
  <div class="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
    <a href="/" class="text-xl font-semibold tracking-tight text-[#E5E7EB] hover:text-[#06B6D4] transition-colors">
      Ultralisk
    </a>
    <div class="hidden md:flex items-center gap-8">
      {navLinks.map(link => (
        <a
          href={link.href}
          class:list={[
            'text-sm transition-colors',
            currentPath === link.href
              ? 'text-[#06B6D4]'
              : 'text-[#94A3B8] hover:text-[#E5E7EB]'
          ]}
        >
          {link.label}
        </a>
      ))}
    </div>
    <a
      href="https://github.com/nicholasli/ultralisk"
      target="_blank"
      rel="noopener noreferrer"
      class="text-sm px-4 py-2 border border-[#1F2937] rounded-md text-[#E5E7EB] hover:border-[#06B6D4] hover:text-[#06B6D4] transition-colors"
    >
      GitHub ↗
    </a>
  </div>
</nav>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/Nav.astro
git commit -m "feat(website): Nav component with sticky dark header + GitHub CTA"
```

### Task 2.3: Create `Footer.astro` component

**Files:**
- Create: `website/src/components/Footer.astro`

- [ ] **Step 1: Write `website/src/components/Footer.astro`**

```astro
---
---

<footer class="border-t border-[#1F2937] mt-24">
  <div class="max-w-[1200px] mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
    <div>
      <div class="text-lg font-semibold text-[#E5E7EB]">Ultralisk</div>
      <p class="text-sm text-[#94A3B8] mt-2">Production-grade LLM API infrastructure.</p>
      <p class="text-sm text-[#94A3B8] mt-4">© 2026</p>
    </div>
    <div class="flex flex-col gap-2 text-sm">
      <a href="https://github.com/nicholasli/ultralisk" target="_blank" rel="noopener noreferrer" class="text-[#94A3B8] hover:text-[#06B6D4] transition-colors">
        GitHub ↗
      </a>
      <a href="https://github.com/nicholasli/ultralisk/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" class="text-[#94A3B8] hover:text-[#06B6D4] transition-colors">
        License (MIT)
      </a>
      <a href="https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%9E%B6%E6%9E%84" target="_blank" rel="noopener noreferrer" class="text-[#94A3B8] hover:text-[#06B6D4] transition-colors">
        Docs ↗
      </a>
    </div>
    <div class="text-sm text-[#94A3B8]">
      Maintained by an anonymous data center.
    </div>
  </div>
</footer>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/Footer.astro
git commit -m "feat(website): Footer with 3-column layout + docs link to README"
```

---

## Phase 3 — Shared Components

### Task 3.1: Create `Button.astro` component (Primary/Secondary/Ghost)

**Files:**
- Create: `website/src/components/Button.astro`

- [ ] **Step 1: Write `website/src/components/Button.astro`**

```astro
---
export interface Props {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  external?: boolean;
}

const { href, variant = 'primary', external = false } = Astro.props;

const baseClasses = 'inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium transition-colors';
const variantClasses = {
  primary: 'bg-[#06B6D4] text-[#0B0E14] hover:bg-[#22D3EE]',
  secondary: 'border border-[#1F2937] text-[#E5E7EB] hover:border-[#06B6D4] hover:text-[#06B6D4]',
  ghost: 'text-[#06B6D4] hover:text-[#22D3EE]',
};

const externalAttrs = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
---

<a href={href} class={`${baseClasses} ${variantClasses[variant]}`} {...externalAttrs}>
  <slot />
</a>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/Button.astro
git commit -m "feat(website): Button component with primary/secondary/ghost variants"
```

### Task 3.2: Create `Hero.astro` component

**Files:**
- Create: `website/src/components/Hero.astro`

- [ ] **Step 1: Write `website/src/components/Hero.astro`**

```astro
---
import Button from './Button.astro';
---

<section class="hero-bg relative">
  <div class="max-w-[1200px] mx-auto px-6 pt-24 pb-32 md:pt-32 md:pb-40">
    <h1 class="text-5xl md:text-7xl font-bold leading-tight tracking-tight text-[#E5E7EB] max-w-4xl">
      <slot name="title">Wrap your inference engine. Ship to production.</slot>
    </h1>
    <p class="mt-8 text-lg md:text-xl text-[#94A3B8] max-w-2xl leading-relaxed">
      <slot name="subtitle" />
    </p>
    <div class="mt-12 flex flex-wrap items-center gap-4">
      <slot name="ctas" />
    </div>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/Hero.astro
git commit -m "feat(website): Hero component with named slots for title/subtitle/CTAs"
```

### Task 3.3: Create `ModuleCard.astro` component (with compact + full variants)

**Files:**
- Create: `website/src/components/ModuleCard.astro`

- [ ] **Step 1: Write `website/src/components/ModuleCard.astro`**

```astro
---
export interface Props {
  title: string;
  claim: string;
  bullets?: string[];
  illustration?: string;
  learnMoreHref?: string;
  variant?: 'compact' | 'full';
}

const {
  title,
  claim,
  bullets = [],
  illustration,
  learnMoreHref,
  variant = 'full',
} = Astro.props;

const isCompact = variant === 'compact';
---

<div class={`group border border-[#1F2937] bg-[#11151C] rounded-lg hover:border-[#06B6D4] transition-colors ${isCompact ? 'p-6' : 'p-8'}`}>
  {illustration && (
    <div class={isCompact ? 'w-16 h-16 mb-4' : 'w-48 h-48 mb-6'}>
      <Fragment set:html={illustration} />
    </div>
  )}
  <h3 class={`font-semibold text-[#E5E7EB] ${isCompact ? 'text-base' : 'text-2xl'}`}>
    {title}
  </h3>
  <p class={`text-[#94A3B8] ${isCompact ? 'text-sm mt-2' : 'mt-3'}`}>
    {claim}
  </p>
  {bullets.length > 0 && !isCompact && (
    <ul class="mt-6 space-y-2 text-[#E5E7EB]">
      {bullets.map(bullet => (
        <li class="flex gap-3">
          <span class="text-[#06B6D4] mt-1">·</span>
          <span>{bullet}</span>
        </li>
      ))}
    </ul>
  )}
  {learnMoreHref && !isCompact && (
    <a
      href={learnMoreHref}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 mt-6 text-[#06B6D4] hover:text-[#22D3EE] text-sm transition-colors"
    >
      Learn more →
    </a>
  )}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/ModuleCard.astro
git commit -m "feat(website): ModuleCard with compact + full variants"
```

### Task 3.4: Create `CodeBlock.astro` component

**Files:**
- Create: `website/src/components/CodeBlock.astro`

- [ ] **Step 1: Write `website/src/components/CodeBlock.astro`**

```astro
---
export interface Props {
  code: string;
  language?: string;
}

const { code, language = 'bash' } = Astro.props;
---

<div class="relative border border-[#1F2937] rounded-lg bg-[#11151C] overflow-hidden">
  <button
    type="button"
    data-code={code}
    class="copy-btn absolute top-3 right-3 text-xs px-3 py-1.5 rounded border border-[#1F2937] text-[#94A3B8] hover:border-[#06B6D4] hover:text-[#06B6D4] transition-colors"
    aria-label="Copy code to clipboard"
  >
    Copy
  </button>
  <pre class={`language-${language} overflow-x-auto p-6 text-sm leading-relaxed font-mono text-[#E5E7EB]`}><code>{code}</code></pre>
</div>

<script>
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.getAttribute('data-code') ?? '';
      await navigator.clipboard.writeText(code);
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });
</script>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/CodeBlock.astro
git commit -m "feat(website): CodeBlock with copy-to-clipboard button"
```

### Task 3.5: Create `ArchitectureDiagram.astro` component

**Files:**
- Create: `website/src/components/ArchitectureDiagram.astro`

- [ ] **Step 1: Write `website/src/components/ArchitectureDiagram.astro`**

```astro
---
// Inline SVG architecture diagram (per spec §3.4.2 #3)
// Decoupled layers: Client → Kong Gateway → FastAPI app → Inference backend
// Cyan data-flow accents on dark background.
---

<div class="border border-[#1F2937] rounded-lg bg-[#11151C] p-8">
  <svg viewBox="0 0 800 360" xmlns="http://www.w3.org/2000/svg" class="w-full h-auto">
    <!-- Layer boxes -->
    <g font-family="Inter, system-ui, sans-serif" font-size="14" fill="#E5E7EB">
      <!-- Client -->
      <rect x="20" y="140" width="120" height="80" rx="8" fill="#11151C" stroke="#1F2937" stroke-width="1.5" />
      <text x="80" y="175" text-anchor="middle">Client</text>
      <text x="80" y="195" text-anchor="middle" fill="#94A3B8" font-size="11">Your app / curl</text>

      <!-- Gateway -->
      <rect x="200" y="140" width="140" height="80" rx="8" fill="#11151C" stroke="#06B6D4" stroke-width="1.5" />
      <text x="270" y="175" text-anchor="middle" fill="#06B6D4">Kong Gateway</text>
      <text x="270" y="195" text-anchor="middle" fill="#94A3B8" font-size="11">auth · rate-limit · metrics</text>

      <!-- FastAPI app -->
      <rect x="400" y="120" width="160" height="120" rx="8" fill="#11151C" stroke="#06B6D4" stroke-width="1.5" />
      <text x="480" y="155" text-anchor="middle" fill="#06B6D4">FastAPI Application</text>
      <text x="480" y="178" text-anchor="middle" fill="#94A3B8" font-size="10">safety · quota · logging</text>
      <text x="480" y="195" text-anchor="middle" fill="#94A3B8" font-size="10">Prometheus · OTel</text>
      <text x="480" y="220" text-anchor="middle" fill="#94A3B8" font-size="10">→ Loki · Tempo</text>

      <!-- Inference -->
      <rect x="620" y="140" width="160" height="80" rx="8" fill="#11151C" stroke="#1F2937" stroke-width="1.5" />
      <text x="700" y="170" text-anchor="middle">Inference Engine</text>
      <text x="700" y="190" text-anchor="middle" fill="#94A3B8" font-size="11">vLLM · TGI · SGLang</text>
    </g>

    <!-- Arrows -->
    <g stroke="#06B6D4" stroke-width="1.5" fill="none">
      <line x1="140" y1="180" x2="200" y2="180" marker-end="url(#arrow)" />
      <line x1="340" y1="180" x2="400" y2="180" marker-end="url(#arrow)" />
      <line x1="560" y1="180" x2="620" y2="180" marker-end="url(#arrow)" />
    </g>
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#06B6D4" />
      </marker>
    </defs>

    <!-- Labels above -->
    <g font-family="Inter, system-ui, sans-serif" font-size="10" fill="#94A3B8">
      <text x="270" y="125" text-anchor="middle">SWAPPABLE</text>
      <text x="480" y="105" text-anchor="middle">ULTRALISK CORE</text>
      <text x="700" y="125" text-anchor="middle">PLUGGABLE</text>
    </g>
  </svg>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/ArchitectureDiagram.astro
git commit -m "feat(website): ArchitectureDiagram inline SVG with cyan data-flow"
```

### Task 3.6: Create `Badge.astro` component

**Files:**
- Create: `website/src/components/Badge.astro`

- [ ] **Step 1: Write `website/src/components/Badge.astro`**

```astro
---
export interface Props {
  variant?: 'default' | 'success';
}

const { variant = 'default' } = Astro.props;
const colorClasses = variant === 'success' ? 'text-[#10B981] border-[#10B981]' : 'text-[#06B6D4] border-[#06B6D4]';
---

<span class={`inline-flex items-center text-xs px-2 py-0.5 rounded border ${colorClasses} font-mono`}>
  <slot />
</span>
```

- [ ] **Step 2: Commit**

```bash
git add website/src/components/Badge.astro
git commit -m "feat(website): Badge component for small pills (v0.1, MIT)"
```

---

## Phase 4 — Content Collections & Page Wrappers

### Task 4.1: Set up Content Collections schema

**Files:**
- Create: `website/src/content.config.ts`

- [ ] **Step 1: Create content directory**

```bash
mkdir -p website/src/content
```

- [ ] **Step 2: Write `website/src/content.config.ts`**

```typescript
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(155),
    navTitle: z.string().optional(),
  }),
});

export const collections = { pages };
```

- [ ] **Step 3: Commit**

```bash
git add website/src/content.config.ts
git commit -m "feat(website): Content Collections schema with Zod (title/description/navTitle)"
```

### Task 4.2: Write `home.md` content

**Files:**
- Create: `website/src/content/home.md`

- [ ] **Step 1: Write `website/src/content/home.md`**

```markdown
---
title: Wrap your inference engine. Ship to production.
description: Production-grade LLM API infrastructure. Wrap your inference engine with auth, observability, safety, and logging. Open source.
navTitle: Home
---

Ultralisk gives every LLM API the four things no inference engine ships — auth, observability, safety, and logging. Decoupled from vLLM, TGI, or SGLang. MIT licensed.
```

- [ ] **Step 2: Commit**

```bash
git add website/src/content/home.md
git commit -m "content(website): home.md with hero copy"
```

### Task 4.3: Write `architecture.md`, `modules.md`, `quickstart.md`, `about.md` content

**Files:**
- Create: `website/src/content/architecture.md`
- Create: `website/src/content/modules.md`
- Create: `website/src/content/quickstart.md`
- Create: `website/src/content/about.md`

- [ ] **Step 1: Write `architecture.md`**

```markdown
---
title: Architecture
description: Three swappable layers: gateway, app, inference. Switch inference engines without rewriting auth, safety, or logging.
navTitle: Architecture
---

Three layers, each swappable. The gateway terminates auth and rate limits. Your app owns the chat logic and the safety pipeline. The inference engine can be vLLM today and SGLang tomorrow — Ultralisk doesn't care, because nothing past the gateway depends on it.
```

- [ ] **Step 2: Write `modules.md`** (OC2/OC3 — using suggested drafts from spec; owner may amend)

```markdown
---
title: Modules
description: Four modules: auth & quota, observability, safety, logging & tracing. Pluggable, production-grade, open source.
navTitle: Modules
---

Ultralisk ships four independent modules. Use what you need, swap what you don't.

## Auth & Quota

**Stop runaway usage before it hits your GPU bill. Daily and monthly quotas return 429s the moment a caller crosses the line.**

- API Key authentication at the gateway
- QPS rate limits (per consumer tier)
- Daily and monthly token quotas
- Clear 429 responses with `Retry-After` header

Learn more: [README § 模块一:鉴权与限流](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%B8%80%E9%89%B4%E6%9D%83%E4%B8%8E%E9%99%90%E6%B5%81)

## Observability

**See latency and error rates at every stage. TTFT, queue depth, and quota rejections — Prometheus metrics out of the box.**

- TTFT, TPOT, throughput metrics
- GPU utilization + memory tracking
- Per-stage error breakdown (safety, quota, inference)
- Grafana dashboards ready to import

Learn more: [README § 模块二:监控](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%BA%8C%E7%9B%91%E6%8E%A7)

## Safety

**Catch jailbreak prompts and sensitive output before it reaches the user. Rule engine first, model second, both async-friendly.**

- DFA-based jailbreak + sensitive-word detection
- Async moderation model (Llama Guard compatible)
- Streaming-safe output sanitization
- Block / redact / log actions per stage

Learn more: [README § 模块三:内容安全](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%B8%89%E5%86%85%E5%AE%B9%E5%AE%89%E5%85%A8)

## Logging & Tracing

**Reconstruct any request end-to-end from a single `request_id`. Structured JSON + OTel spans, ready for Loki or Tempo.**

- One `request_id` per request, full timeline
- Structured JSON logs with token usage
- OTel spans across all stages
- Loki / Tempo ready

Learn more: [README § 模块四:日志与追踪](https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E5%9B%9B%E6%97%A5%E5%BF%97%E4%B8%8E%E8%BF%BD%E8%B8%AA)
```

- [ ] **Step 3: Write `quickstart.md`**

```markdown
---
title: Quickstart
description: Up and running in 60 seconds. Clone, docker-compose up, curl your first chat completion.
navTitle: Quickstart
---

Prerequisites: Docker, Docker Compose.

```bash
git clone https://github.com/nicholasli/ultralisk.git
cd ultralisk
docker-compose up -d
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "apikey: <your-key>" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```
```

- [ ] **Step 4: Write `about.md`** (using spec §5.3 origin story)

```markdown
---
title: About
description: Ultralisk started in our own data center. We extracted the plumbing we kept rebuilding.
navTitle: About
---

Ultralisk started in our own data center. We had GPUs running open-source models, but turning that compute into a callable API kept meaning rebuilding the same plumbing — auth, rate limits, metrics, content moderation, request logs. Every team reinvented it. So we extracted our version.

Ultralisk is that plumbing. It wraps your inference engine — vLLM, TGI, or SGLang — and gives you production-grade infrastructure behind a single endpoint. You keep the model. We handle the rest.

## Why open source

We open-sourced it under MIT because infrastructure should be shared. Use it, fork it, ship it.

## Maintainers

Maintained by an anonymous data center engineering team. PRs welcome.

## License

MIT © 2026
```

- [ ] **Step 5: Commit**

```bash
git add website/src/content/
git commit -m "content(website): architecture, modules, quickstart, about markdown sources"
```

> **OC items flagged for owner review:**
> - OC1 (architecture sub-paragraph): using suggested draft from spec §9.
> - OC2/OC3 (module claims + bullets): using suggested drafts from spec §9.
> - **Owner should review these drafts before merge.**

---

## Phase 5 — Page Wrappers

### Task 5.1: Create `index.astro` (Home page)

**Files:**
- Create: `website/src/pages/index.astro`
- Create: `website/src/assets/illustrations/` (placeholder)

- [ ] **Step 1: Create directories**

```bash
mkdir -p website/src/pages website/src/assets/illustrations
```

- [ ] **Step 2: Write `website/src/pages/index.astro`**

```astro
---
import { getEntry } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';
import Hero from '../components/Hero.astro';
import Button from '../components/Button.astro';
import ModuleCard from '../components/ModuleCard.astro';
import ArchitectureDiagram from '../components/ArchitectureDiagram.astro';

const home = await getEntry('pages', 'home');
if (!home) throw new Error('home.md content not found');

// Placeholder illustrations (full SVGs added in Phase 6)
const moduleCards = [
  { title: 'Auth & Quota', claim: 'API keys, rate limits, token quotas — with clear 429s.', slug: 'auth' },
  { title: 'Observability', claim: 'TTFT, TPOT, throughput — Prometheus metrics out of the box.', slug: 'observability' },
  { title: 'Safety', claim: 'Jailbreak + sensitive output filtering, async moderation-ready.', slug: 'safety' },
  { title: 'Logging & Tracing', claim: 'One `request_id`, full timeline. OTel + JSON logs.', slug: 'logging' },
];
---

<BaseLayout title={home.data.title} description={home.data.description}>
  <Nav />
  <main>
    <Hero>
      <Fragment slot="title">{home.data.title}</Fragment>
      <Fragment slot="subtitle">{home.data.body}</Fragment>
      <Fragment slot="ctas">
        <Button href="/quickstart" variant="primary">Quickstart →</Button>
        <Button href="https://github.com/nicholasli/ultralisk" variant="secondary" external>View on GitHub ↗</Button>
      </Fragment>
    </Hero>

    <section class="border-y border-[#1F2937]">
      <div class="max-w-[1200px] mx-auto px-6 py-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-[#94A3B8]">
        <span>Decoupled</span>
        <span class="text-[#374151]">·</span>
        <span>Production-grade</span>
        <span class="text-[#374151]">·</span>
        <span>Modular</span>
        <span class="text-[#374151]">·</span>
        <span>Open source (MIT)</span>
      </div>
    </section>

    <section class="max-w-[1200px] mx-auto px-6 py-24">
      <h2 class="text-3xl md:text-4xl font-bold text-[#E5E7EB] mb-12">Four modules. One stack.</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {moduleCards.map(card => (
          <a href="/modules" class="block">
            <ModuleCard title={card.title} claim={card.claim} variant="compact" />
          </a>
        ))}
      </div>
    </section>

    <section class="max-w-[1200px] mx-auto px-6 pb-24">
      <ArchitectureDiagram />
      <p class="mt-8 text-center text-xl text-[#94A3B8]">
        Decouple your engine.
        <a href="/architecture" class="text-[#06B6D4] hover:text-[#22D3EE] ml-2">See full architecture →</a>
      </p>
    </section>

    <section class="max-w-[1200px] mx-auto px-6 py-24 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-[#E5E7EB]">Ready to ship?</h2>
      <p class="mt-4 text-[#94A3B8]">Up and running in 60 seconds.</p>
      <div class="mt-8">
        <Button href="/quickstart" variant="primary">Quickstart →</Button>
      </div>
    </section>
  </main>
  <Footer />
</BaseLayout>
```

- [ ] **Step 3: Verify build**

```bash
cd website && npx astro build 2>&1 | tail -20
```

Expected: build completes; `dist/index.html` exists.

- [ ] **Step 4: Commit**

```bash
cd ..
git add website/src/pages/index.astro
git commit -m "feat(website): Home page with hero, value props, module grid, architecture teaser, CTA"
```

### Task 5.2: Create `architecture.astro` page

**Files:**
- Create: `website/src/pages/architecture.astro`

- [ ] **Step 1: Write `website/src/pages/architecture.astro`**

```astro
---
import { getEntry } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';
import ArchitectureDiagram from '../components/ArchitectureDiagram.astro';

const page = await getEntry('pages', 'architecture');
if (!page) throw new Error('architecture.md content not found');
---

<BaseLayout title={page.data.title} description={page.data.description}>
  <Nav />
  <main>
    <section class="max-w-[1200px] mx-auto px-6 pt-24 pb-12">
      <h1 class="text-4xl md:text-6xl font-bold leading-tight tracking-tight text-[#E5E7EB] max-w-3xl">
        Built in layers. Swappable at every seam.
      </h1>
      <p class="mt-6 text-lg text-[#94A3B8] max-w-2xl leading-relaxed">
        {page.data.body}
      </p>
    </section>

    <section class="max-w-[1200px] mx-auto px-6 py-12">
      <ArchitectureDiagram />
      <div class="mt-12 text-center">
        <a
          href="https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%9E%B6%E6%9E%84"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[#06B6D4] hover:text-[#22D3EE] transition-colors"
        >
          Deep dive → README on GitHub ↗
        </a>
      </div>
    </section>
  </main>
  <Footer />
</BaseLayout>
```

- [ ] **Step 2: Verify build**

```bash
cd website && npx astro build 2>&1 | grep -E "(error|warning|complete)" | head -10
```

Expected: build completes without errors.

- [ ] **Step 3: Commit**

```bash
cd ..
git add website/src/pages/architecture.astro
git commit -m "feat(website): Architecture page with headline + sub + diagram + README link"
```

### Task 5.3: Create `modules.astro` page

**Files:**
- Create: `website/src/pages/modules.astro`

- [ ] **Step 1: Write `website/src/pages/modules.astro`**

```astro
---
import { getEntry } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';
import ModuleCard from '../components/ModuleCard.astro';
import Button from '../components/Button.astro';

const page = await getEntry('pages', 'modules');
if (!page) throw new Error('modules.md content not found');

// Each module's bullets are embedded as HTML in modules.md
// For v0.1, we keep the structure simple: render markdown body,
// then show 4 ModuleCards derived from a static manifest.
const modules = [
  { title: 'Auth & Quota', claim: 'Stop runaway usage before it hits your GPU bill. Daily and monthly quotas return 429s the moment a caller crosses the line.', bullets: ['API Key authentication at the gateway', 'QPS rate limits (per consumer tier)', 'Daily and monthly token quotas', 'Clear 429 responses with Retry-After header'], learnMoreHref: 'https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%B8%80%E9%89%B4%E6%9D%83%E4%B8%8E%E9%99%90%E6%B5%81' },
  { title: 'Observability', claim: 'See latency and error rates at every stage. TTFT, queue depth, and quota rejections — Prometheus metrics out of the box.', bullets: ['TTFT, TPOT, throughput metrics', 'GPU utilization + memory tracking', 'Per-stage error breakdown', 'Grafana dashboards ready to import'], learnMoreHref: 'https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%BA%8C%E7%9B%91%E6%8E%A7' },
  { title: 'Safety', claim: 'Catch jailbreak prompts and sensitive output before it reaches the user. Rule engine first, model second, both async-friendly.', bullets: ['DFA-based jailbreak + sensitive-word detection', 'Async moderation model (Llama Guard compatible)', 'Streaming-safe output sanitization', 'Block / redact / log actions per stage'], learnMoreHref: 'https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E4%B8%89%E5%86%85%E5%AE%B9%E5%AE%89%E5%85%A8' },
  { title: 'Logging & Tracing', claim: 'Reconstruct any request end-to-end from a single request_id. Structured JSON + OTel spans, ready for Loki or Tempo.', bullets: ['One request_id per request, full timeline', 'Structured JSON logs with token usage', 'OTel spans across all stages', 'Loki / Tempo ready'], learnMoreHref: 'https://github.com/nicholasli/ultralisk/blob/main/README.md#%E6%A8%A1%E5%9D%97%E5%9B%9B%E6%97%A5%E5%BF%97%E4%B8%8E%E8%BF%BD%E8%B8%AA' },
];
---

<BaseLayout title={page.data.title} description={page.data.description}>
  <Nav />
  <main>
    <section class="max-w-[1200px] mx-auto px-6 pt-24 pb-12">
      <h1 class="text-4xl md:text-6xl font-bold leading-tight tracking-tight text-[#E5E7EB]">
        Four modules. One stack.
      </h1>
    </section>

    <section class="max-w-[1200px] mx-auto px-6 py-12 space-y-8">
      {modules.map(m => (
        <ModuleCard title={m.title} claim={m.claim} bullets={m.bullets} learnMoreHref={m.learnMoreHref} variant="full" />
      ))}
    </section>

    <section class="max-w-[1200px] mx-auto px-6 py-24 text-center">
      <Button href="/quickstart" variant="primary">Quickstart →</Button>
    </section>
  </main>
  <Footer />
</BaseLayout>
```

> **Note on duplication:** Module bullets/claims are duplicated between `modules.md` (content collection, single source of truth for prose) and this page (typed objects passed to `ModuleCard`). To eliminate duplication: in Phase 8, refactor to load bullets from `modules.md` frontmatter or a separate `modules/*.json` collection. For v0.1, duplication is acceptable.

- [ ] **Step 2: Verify build**

```bash
cd website && npx astro build 2>&1 | tail -5
```

Expected: build completes.

- [ ] **Step 3: Commit**

```bash
cd ..
git add website/src/pages/modules.astro
git commit -m "feat(website): Modules page with 4 full-size cards + closing CTA"
```

### Task 5.4: Create `quickstart.astro` page

**Files:**
- Create: `website/src/pages/quickstart.astro`

- [ ] **Step 1: Write `website/src/pages/quickstart.astro`**

```astro
---
import { getEntry } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';
import CodeBlock from '../components/CodeBlock.astro';

const page = await getEntry('pages', 'quickstart');
if (!page) throw new Error('quickstart.md content not found');

const quickstartCode = `git clone https://github.com/nicholasli/ultralisk.git
cd ultralisk
docker-compose up -d
curl -X POST http://localhost:8080/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "apikey: <your-key>" \\
  -d '{"messages":[{"role":"user","content":"hello"}]}'`;
---

<BaseLayout title={page.data.title} description={page.data.description}>
  <Nav />
  <main>
    <section class="max-w-[1200px] mx-auto px-6 pt-24 pb-12">
      <h1 class="text-4xl md:text-6xl font-bold leading-tight tracking-tight text-[#E5E7EB]">
        Up and running in 60 seconds.
      </h1>
    </section>

    <section class="max-w-[1200px] mx-auto px-6 py-8">
      <p class="text-[#94A3B8] text-lg mb-2"><span class="font-mono text-[#06B6D4]">Prerequisites:</span> Docker, Docker Compose.</p>
      <CodeBlock code={quickstartCode} language="bash" />
      <div class="mt-8">
        <a
          href="https://github.com/nicholasli/ultralisk/blob/main/README.md#%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1 text-[#06B6D4] hover:text-[#22D3EE] transition-colors"
        >
          Full guide → README on GitHub ↗
        </a>
      </div>
    </section>
  </main>
  <Footer />
</BaseLayout>
```

- [ ] **Step 2: Verify build**

```bash
cd website && npx astro build 2>&1 | tail -5
```

Expected: build completes.

- [ ] **Step 3: Verify only one code block on entire site**

```bash
cd website && grep -rE '^\s*```' src/pages src/layouts 2>/dev/null | wc -l
```

Expected: 0 (no fenced code blocks in pages/layouts — CodeBlock is a component).

- [ ] **Step 4: Commit**

```bash
cd ..
git add website/src/pages/quickstart.astro
git commit -m "feat(website): Quickstart page with single CodeBlock + README link"
```

### Task 5.5: Create `about.astro` page

**Files:**
- Create: `website/src/pages/about.astro`

- [ ] **Step 1: Write `website/src/pages/about.astro`**

```astro
---
import { getEntry } from 'astro:content';
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';

const page = await getEntry('pages', 'about');
if (!page) throw new Error('about.md content not found');
---

<BaseLayout title={page.data.title} description={page.data.description}>
  <Nav />
  <main>
    <article class="max-w-[800px] mx-auto px-6 pt-24 pb-12 prose prose-invert">
      <h1 class="text-4xl md:text-6xl font-bold leading-tight tracking-tight text-[#E5E7EB]">
        Born in a data center.
      </h1>
      <div class="mt-12 space-y-6 text-lg text-[#E5E7EB] leading-relaxed">
        <p>{page.data.body}</p>
      </div>
    </article>
  </main>
  <Footer />
</BaseLayout>
```

- [ ] **Step 2: Verify build**

```bash
cd website && npx astro build 2>&1 | tail -5
```

Expected: build completes.

- [ ] **Step 3: Commit**

```bash
cd ..
git add website/src/pages/about.astro
git commit -m "feat(website): About page rendering origin story markdown"
```

---

## Phase 6 — SVG Illustrations

### Task 6.1: Create 4 module SVG illustrations

**Files:**
- Create: `website/src/assets/illustrations/auth.svg`
- Create: `website/src/assets/illustrations/observability.svg`
- Create: `website/src/assets/illustrations/safety.svg`
- Create: `website/src/assets/illustrations/logging.svg`

- [ ] **Step 1: Write `auth.svg`** (per spec §4.5 — stylized key + meter)

```xml
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#11151C"/>
  <!-- Key -->
  <circle cx="60" cy="100" r="22" fill="none" stroke="#06B6D4" stroke-width="3"/>
  <line x1="80" y1="100" x2="160" y2="100" stroke="#06B6D4" stroke-width="3"/>
  <line x1="140" y1="100" x2="140" y2="115" stroke="#06B6D4" stroke-width="3"/>
  <line x1="155" y1="100" x2="155" y2="115" stroke="#06B6D4" stroke-width="3"/>
  <!-- Meter -->
  <line x1="40" y1="160" x2="180" y2="160" stroke="#1F2937" stroke-width="2"/>
  <line x1="110" y1="155" x2="120" y2="180" stroke="#06B6D4" stroke-width="2"/>
  <text x="40" y="180" font-family="JetBrains Mono" font-size="10" fill="#94A3B8">0</text>
  <text x="170" y="180" font-family="JetBrains Mono" font-size="10" fill="#94A3B8">100%</text>
</svg>
```

- [ ] **Step 2: Write `observability.svg`** (line chart + grid)

```xml
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#11151C"/>
  <!-- Grid -->
  <g stroke="#1F2937" stroke-width="1">
    <line x1="20" y1="40" x2="180" y2="40"/>
    <line x1="20" y1="80" x2="180" y2="80"/>
    <line x1="20" y1="120" x2="180" y2="120"/>
    <line x1="20" y1="160" x2="180" y2="160"/>
  </g>
  <!-- Line chart -->
  <polyline points="20,140 50,120 80,130 110,90 140,100 170,60" fill="none" stroke="#06B6D4" stroke-width="2.5"/>
  <g fill="#06B6D4">
    <circle cx="20" cy="140" r="3"/>
    <circle cx="50" cy="120" r="3"/>
    <circle cx="80" cy="130" r="3"/>
    <circle cx="110" cy="90" r="3"/>
    <circle cx="140" cy="100" r="3"/>
    <circle cx="170" cy="60" r="3"/>
  </g>
</svg>
```

- [ ] **Step 3: Write `safety.svg`** (shield + filter funnel + lock)

```xml
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#11151C"/>
  <!-- Shield -->
  <path d="M 100 30 L 160 50 L 160 110 Q 160 150 100 175 Q 40 150 40 110 L 40 50 Z" fill="none" stroke="#06B6D4" stroke-width="3"/>
  <!-- Lock body -->
  <rect x="80" y="100" width="40" height="40" rx="3" fill="#06B6D4"/>
  <!-- Lock shackle -->
  <path d="M 88 100 L 88 88 Q 88 78 100 78 Q 112 78 112 88 L 112 100" fill="none" stroke="#06B6D4" stroke-width="3"/>
</svg>
```

- [ ] **Step 4: Write `logging.svg`** (stacked documents + timeline)

```xml
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#11151C"/>
  <!-- Stacked docs -->
  <rect x="40" y="40" width="80" height="100" rx="3" fill="none" stroke="#1F2937" stroke-width="1.5"/>
  <rect x="50" y="50" width="80" height="100" rx="3" fill="none" stroke="#1F2937" stroke-width="1.5"/>
  <rect x="60" y="60" width="80" height="100" rx="3" fill="none" stroke="#06B6D4" stroke-width="1.5"/>
  <g stroke="#94A3B8" stroke-width="1">
    <line x1="70" y1="80" x2="130" y2="80"/>
    <line x1="70" y1="95" x2="125" y2="95"/>
    <line x1="70" y1="110" x2="130" y2="110"/>
  </g>
  <!-- Timeline arrow -->
  <line x1="30" y1="180" x2="170" y2="180" stroke="#06B6D4" stroke-width="1.5"/>
  <circle cx="60" cy="180" r="3" fill="#06B6D4"/>
  <circle cx="100" cy="180" r="3" fill="#06B6D4"/>
  <circle cx="140" cy="180" r="3" fill="#06B6D4"/>
</svg>
```

- [ ] **Step 5: Update Home page to pass SVG illustrations to ModuleCard**

Modify `website/src/pages/index.astro` — replace the `moduleCards` array with one that includes SVG markup:

```typescript
import authSvg from '../assets/illustrations/auth.svg?raw';
import obsSvg from '../assets/illustrations/observability.svg?raw';
import safetySvg from '../assets/illustrations/safety.svg?raw';
import logSvg from '../assets/illustrations/logging.svg?raw';

const moduleCards = [
  { title: 'Auth & Quota', claim: 'API keys, rate limits, token quotas — with clear 429s.', illustration: authSvg, slug: 'auth' },
  { title: 'Observability', claim: 'TTFT, TPOT, throughput — Prometheus metrics out of the box.', illustration: obsSvg, slug: 'observability' },
  { title: 'Safety', claim: 'Jailbreak + sensitive output filtering, async moderation-ready.', illustration: safetySvg, slug: 'safety' },
  { title: 'Logging & Tracing', claim: 'One request_id, full timeline. OTel + JSON logs.', illustration: logSvg, slug: 'logging' },
];
```

And update the ModuleCard invocation:

```astro
{moduleCards.map(card => (
  <a href="/modules" class="block">
    <ModuleCard title={card.title} claim={card.claim} illustration={card.illustration} variant="compact" />
  </a>
))}
```

- [ ] **Step 6: Verify build**

```bash
cd website && npx astro build 2>&1 | tail -5
```

Expected: build completes without errors.

- [ ] **Step 7: Commit**

```bash
cd ..
git add website/src/assets/illustrations/ website/src/pages/index.astro
git commit -m "feat(website): 4 module SVG illustrations + Home page integration"
```

---

## Phase 7 — SEO & Assets

### Task 7.1: Create favicon

**Files:**
- Create: `website/public/favicon.svg`

- [ ] **Step 1: Write `website/public/favicon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#0B0E14"/>
  <text x="16" y="22" text-anchor="middle" font-family="ui-monospace, monospace" font-size="18" font-weight="700" fill="#06B6D4">U</text>
</svg>
```

- [ ] **Step 2: Commit**

```bash
git add website/public/favicon.svg
git commit -m "feat(website): favicon with cyan U on dark background"
```

### Task 7.2: Create OG image placeholder

**Files:**
- Create: `website/public/og-image.png`

- [ ] **Step 1: Generate OG image**

Use any tool to create a 1200×630 PNG with the Ultralisk wordmark + tagline. Suggested: Figma, Canva, or a quick SVG-to-PNG render.

For automated generation, save the following as `website/scripts/gen-og.mjs` (optional, can be skipped):

```javascript
// Optional: generate og-image.png via @resvg/resvg-js or similar
// Skipping for v0.1 — owner can design the OG image in any tool.
```

**For v0.1, use any tool to create a 1200×630 PNG with:**
- Background: `#0B0E14`
- Wordmark: `Ultralisk` in Inter 700, ~120px, white
- Tagline: `Production-grade LLM API infrastructure` in Inter 400, ~32px, gray
- Accent: cyan dot or geometric mark

Save as `website/public/og-image.png`.

- [ ] **Step 2: Verify dimensions**

```bash
file website/public/og-image.png
```

Expected: `PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced`

- [ ] **Step 3: Commit**

```bash
git add website/public/og-image.png
git commit -m "feat(website): OG image 1200x630 with wordmark + tagline"
```

### Task 7.3: Create robots.txt

**Files:**
- Create: `website/public/robots.txt`

- [ ] **Step 1: Write `website/public/robots.txt`**

```
User-agent: *
Allow: /

Sitemap: https://ultralisk.pages.dev/sitemap-index.xml
```

- [ ] **Step 2: Commit**

```bash
git add website/public/robots.txt
git commit -m "feat(website): robots.txt allowing all + sitemap reference"
```

### Task 7.4: Verify sitemap generation

**Files:** None (verification only)

- [ ] **Step 1: Build site**

```bash
cd website && npx astro build 2>&1 | tail -5
```

Expected: build completes.

- [ ] **Step 2: Verify sitemap exists in dist**

```bash
ls website/dist/sitemap*.xml
```

Expected: at least one `sitemap-index.xml` or `sitemap-0.xml` file.

- [ ] **Step 3: Inspect sitemap content**

```bash
cat website/dist/sitemap-0.xml | head -30
```

Expected: URLs for `/`, `/architecture`, `/modules`, `/quickstart`, `/about`.

---

## Phase 8 — Polish & Verification

### Task 8.1: Build and verify all acceptance criteria

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

```bash
cd website && rm -rf dist && npx astro build 2>&1 | tail -10
```

Expected: build completes with no errors.

- [ ] **Step 2: Start preview server**

```bash
cd website && npx astro preview --port 4321 &
sleep 3
```

- [ ] **Step 3: Smoke-test all 5 routes**

```bash
for route in / /architecture /modules /quickstart /about; do
  status=$(curl -o /dev/null -s -w "%{http_code}" "http://localhost:4321${route}")
  echo "${route}: ${status}"
done
```

Expected: all 5 routes return `200`.

- [ ] **Step 4: Verify meta descriptions present**

```bash
curl -s http://localhost:4321/ | grep -o '<meta name="description"[^>]*>' | head -3
```

Expected: at least one meta description line per page.

- [ ] **Step 5: Verify exactly 1 code block on Quickstart**

```bash
curl -s http://localhost:4321/quickstart | grep -c '<pre'
```

Expected: 1.

- [ ] **Step 6: Verify external links open in new tab with `rel="noopener noreferrer"`**

```bash
curl -s http://localhost:4321/ | grep -oE 'href="https?://[^"]*"[^>]*' | grep -v 'rel="noopener noreferrer"' | head -5
```

Expected: no external links missing `rel="noopener noreferrer"` (modulo internal anchors).

- [ ] **Step 7: Kill preview server**

```bash
pkill -f "astro preview" || true
```

### Task 8.2: Check bundle size budgets (spec §8 #17, #18)

**Files:** None (verification only)

- [ ] **Step 1: Build and measure**

```bash
cd website && npx astro build
echo "--- CSS ---"
find dist -name "*.css" -exec gzip -c {} \; | wc -c | awk '{printf "Total CSS (gzipped): %.1f KB\n", $1/1024}'
echo "--- JS ---"
find dist -name "*.js" -exec gzip -c {} \; | wc -c | awk '{printf "Total JS (gzipped): %.1f KB\n", $1/1024}'
```

Expected: CSS ≤ 30 KB gzipped, JS ≤ 5 KB gzipped.

### Task 8.3: Update website/README.md with full dev/deploy docs

**Files:**
- Modify: `website/README.md`

- [ ] **Step 1: Replace `website/README.md`**

```markdown
# Ultralisk Website

Marketing site for [Ultralisk](https://github.com/nicholasli/ultralisk). Built with Astro 7 + Tailwind v4.

## Prerequisites

- Node.js ≥ 20.3.0 (pinned in `package.json` `engines`)

## Development

```bash
npm install
npm run dev
```

Site runs at http://localhost:4321.

## Build

```bash
npm run build
```

Outputs static site to `dist/`.

## Preview production build

```bash
npm run preview
```

## Deployment

Deployed via Cloudflare Pages. Every push to `main` triggers an automatic build.

Preview URL: Cloudflare Pages-provided (e.g., `ultralisk.pages.dev`).

## Project structure

See [`docs/superpowers/specs/2026-07-07-ultralisk-website-design.md`](../specs/2026-07-07-ultralisk-website-design.md) for the full design spec and §6.3 for the repo layout.

## Contributing

- All page copy lives in `src/content/*.md` (Content Collections).
- All shared UI lives in `src/components/*.astro`.
- Theme tokens live in `src/styles/global.css` under `@theme { ... }`.

Edits to copy don't require a build review. Edits to components or styles should be reviewed.
```

- [ ] **Step 2: Commit**

```bash
git add website/README.md
git commit -m "docs(website): expand README with dev/build/deploy + project structure"
```

### Task 8.4: Lighthouse audit (manual)

**Files:** None (verification only)

- [ ] **Step 1: Start preview**

```bash
cd website && npx astro preview --port 4321 &
sleep 3
```

- [ ] **Step 2: Run Lighthouse on Home**

Use Chrome DevTools → Lighthouse → Mobile → all categories.

Expected: Performance ≥ 90, Accessibility ≥ 90, Best Practices ≥ 90, SEO ≥ 90.

- [ ] **Step 3: Document results**

If any score < 90, file an issue with the score + URL. Don't try to fix in this plan.

- [ ] **Step 4: Kill preview**

```bash
pkill -f "astro preview" || true
```

---

## Phase 9 — Cloudflare Pages Setup

### Task 9.1: Document Cloudflare Pages setup

**Files:**
- Modify: `website/README.md` (or repo root `.github/workflows/` if automated build desired)

- [ ] **Step 1: Note setup steps in README**

Append to `website/README.md`:

```markdown

## Cloudflare Pages setup (one-time)

1. Log in to https://dash.cloudflare.com/
2. Pages → Create application → Connect to Git → select `nicholasli/ultralisk`
3. Build settings:
   - **Framework preset**: Astro
   - **Build command**: `cd website && npm install && npm run build`
   - **Build output directory**: `website/dist`
   - **Root directory**: `website`
   - **Node version**: 20 (or higher)
4. Environment variables: none required for v0.1
5. Save and deploy

Future pushes to `main` will auto-deploy.
```

- [ ] **Step 2: Commit**

```bash
git add website/README.md
git commit -m "docs(website): Cloudflare Pages setup steps in README"
```

### Task 9.2: Final verification — git log + branch state

**Files:** None

- [ ] **Step 1: Verify clean working tree**

```bash
cd ..  # repo root
git status
```

Expected: clean working tree (no uncommitted changes).

- [ ] **Step 2: Show commit history for `website/`**

```bash
git log --oneline main -- website/
```

Expected: ~25-30 commits, one per task.

- [ ] **Step 3: Confirm branch**

```bash
git branch --show-current
```

Expected: `main` (or feature branch if working in one).

---

## Definition of Done (per spec §8)

This plan is complete when **all** §8 acceptance criteria are verified:

1. ✅ All 5 pages render and navigate (verified in Task 8.1 #3)
2. ✅ Home Hero displays with locked §5.1 copy (visual review)
3. ✅ Module cards display 4 distinct SVG illustrations × 2 sizes (Tasks 3.3 + 6.1)
4. ✅ Architecture diagram is inline SVG (Task 3.5)
5. ✅ Quickstart has exactly 1 code block with copy button (Task 5.4)
6. ✅ Visual system matches §4.1/§4.2 tokens (CSS-first in global.css, Task 1.1)
7. ✅ `astro build` succeeds (Tasks 0.2, 5.1-5.5, 8.1)
8. ✅ Cloudflare Pages deploy on push (Task 9.1)
9. ⏳ Lighthouse ≥ 90 on Home (Task 8.4 — manual)
10. ✅ External links `rel="noopener noreferrer"` (Tasks 2.2, 2.3, 3.1, 3.3, 4.3, 5.2-5.4)
11. ✅ `website/README.md` documents dev/build/deploy (Task 8.3 + 9.1)
12. ✅ Exactly 1 code block site-wide (Task 5.4 verification)
13. ✅ favicon + og-image + robots.txt in `public/` (Tasks 7.1-7.3)
14. ✅ sitemap.xml generated (Task 7.4)
15. ✅ Unique meta descriptions per page (Tasks 2.1 + content frontmatter, Task 8.1 #4)
16. ✅ Wordmark in nav renders in Inter 600 (Task 2.2)
17. ⏳ CSS ≤ 30 KB gzipped (Task 8.2)
18. ⏳ JS ≤ 5 KB gzipped (Task 8.2)

---

## Open Creative Items (carry-over from spec §9)

The implementer used **suggested drafts** from spec §9 for the following. **Owner should review before merge:**

- **OC1**: Architecture sub-paragraph → in `architecture.md` body
- **OC2**: Module 1-line claims → in `modules.astro` (and `modules.md`)
- **OC3**: Module bullets → in `modules.astro` (and `modules.md`)
- **OC4**: Meta descriptions → in each `.md` file frontmatter

If owner wants to amend any of these, edit the source file directly and the change will reflect on the next build.

---

## Total Tasks: 25

| Phase | Tasks | Estimated Time |
|---|---|---|
| 0 — Bootstrap | 0.1, 0.2 | 15 min |
| 1 — Visual System | 1.1, 1.2 | 10 min |
| 2 — Layout & Nav | 2.1, 2.2, 2.3 | 15 min |
| 3 — Shared Components | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 | 30 min |
| 4 — Content Collections | 4.1, 4.2, 4.3 | 15 min |
| 5 — Page Wrappers | 5.1, 5.2, 5.3, 5.4, 5.5 | 30 min |
| 6 — SVG Illustrations | 6.1 | 20 min |
| 7 — SEO & Assets | 7.1, 7.2, 7.3, 7.4 | 15 min |
| 8 — Polish & Verify | 8.1, 8.2, 8.3, 8.4 | 20 min |
| 9 — Cloudflare Setup | 9.1, 9.2 | 10 min |

**Total estimated implementation time**: ~3 hours focused work for a developer familiar with the stack.

---

## Notes for the implementer

- **Worktree recommended**: This plan modifies ~30 files. Consider creating a worktree (`git worktree add ../ultralisk-website website-feature`) before starting.
- **OC items**: Use suggested drafts as-is. Flag for owner at the end. Don't over-iterate.
- **Don't gold-plate**: Marketing sites ship when acceptance criteria are met. No premature optimization.
- **Commit frequently**: Each task ends with a commit. Don't bundle tasks.
- **If something fails**: Stop, diagnose, fix. Don't paper over with `--force` or skip-and-continue.
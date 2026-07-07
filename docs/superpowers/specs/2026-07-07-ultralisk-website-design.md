# Ultralisk Official Website — Design Spec

**Date**: 2026-07-07
**Status**: Draft — pending review
**Source**: Brainstorming session with project owner

---

## 1. Overview

Build the official website for **Ultralisk** at `ultralisk.dev` (placeholder domain). The site is the public-facing front door for the project — it tells visitors what Ultralisk is, why it exists, and how to try it. Technical depth lives in the project's GitHub `docs/` folder; the website stays light and marketing-leaning.

Ultralisk itself is a production-grade LLM API infrastructure layer that wraps open-source inference engines (vLLM / TGI / SGLang) with auth & rate limiting, observability, content safety, and structured logging — decoupled from the inference engine.

This spec captures the design decisions reached during brainstorming on 2026-07-07. It is the source of truth for the website's positioning, information architecture, visual system, content, and tech stack.

---

## 2. Positioning

| Dimension | Decision |
|---|---|
| Audience | Narrow: engineers consuming the data center's LLM API. Heritage is Chinese-context, but content is English-first. |
| Brand architecture | **Ultralisk is the head brand.** The data center is anonymous backstory — never named on the site. |
| Website goal | Brand face + engineering entry. Lightweight v0.1. |
| Hero message | "The data center's external API gateway for LLMs." GPU compute → callable API. |
| Tone | Engineering-serious / calm. Kong / Prometheus aesthetic. |
| Language | **Pure English.** |
| Data center in About | Hide name. Tell the story. |
| Differentiation (the one thing) | The data-center context + the decoupling story. Not modularity, not tests, not compliance specifically. |

---

## 3. Information Architecture

### 3.1 Sitemap

```
ultralisk.dev/
├── /                  → Home
├── /architecture      → Architecture
├── /modules           → Modules
├── /quickstart        → Quickstart
└── /about             → About
```

### 3.2 Navigation

- **Top nav** (sticky, semi-transparent dark, bottom border):
  - Left: wordmark `Ultralisk`
  - Center: `Architecture` · `Modules` · `Quickstart` · `About`
  - Right: `GitHub ↗` (external link, opens new tab)
- **Footer** (3-column, simple):
  - Col 1: `Ultralisk` + one-line positioning + © 2026
  - Col 2: `GitHub` · `License (MIT)` · `Docs ↗` (placeholder, links to GitHub repo `docs/` folder for now)
  - Col 3: `Maintained by an anonymous data center` (subtle, gray)

### 3.3 Content Philosophy

- Every page is ≤ 1 screen on desktop. Quickstart may extend to ~2 screens.
- Total code blocks on the entire site: **1–2**, both in Quickstart only.
- Architecture diagrams are visual decoration, not deep technical breakdowns.
- Module cards use **business language** (e.g., "Stop runaway usage with token quotas and 429s"), not feature-list language ("Kong rate-limiting plugin").
- Deep technical content lives in `docs/`. Website uses **placeholder links** to the GitHub repo (`docs/`, `docs/modules/...`, etc.) — the docs site itself is **out of scope** for v0.1.

### 3.4 Per-Page Outlines

#### 3.4.1 Home (`/`)

| # | Section | Content |
|---|---|---|
| 1 | **Hero** | H1 + sub + 2 CTAs. Occupies most of the first screen. Subtle dark background pattern. |
| 2 | **Value props strip** | 4 phrases in a horizontal row: `Decoupled · Production-grade · Modular · Open source (MIT)` |
| 3 | **Module grid** | "Four modules. One stack." Headline + 4 cards in a row. Each card: custom SVG + module name + 1-line claim. Clicking a card → Modules page. |
| 4 | **Architecture teaser** | Full-width architecture SVG (visual only, no labels). Subtitle: "Decouple your engine." Link → Architecture page. |
| 5 | **Closing CTA** | "Ready to ship?" → `Quickstart →` |

#### 3.4.2 Architecture (`/architecture`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Built in layers. Swappable at every seam." |
| 2 | **Sub-paragraph** | 1 paragraph explaining the decoupling idea (Kong / app / inference as independent layers). |
| 3 | **Big architecture diagram** | Inline SVG, fills the first screen. Cyan data-flow accents on dark. |
| 4 | **Deep-dive link** | "Deep dive → `docs/architecture` ↗" (placeholder, links to GitHub). |

#### 3.4.3 Modules (`/modules`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Four modules. One stack." |
| 2 | **4 stacked cards** | One card per module (Auth & Quota / Observability / Safety / Logging & Tracing). Each card: custom SVG illustration + module title + 1-paragraph value claim + 3–4 bullets in business language + "Learn more → `docs/<name>` ↗" placeholder link. |
| 3 | **Closing CTA** | → `Quickstart` |

#### 3.4.4 Quickstart (`/quickstart`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Up and running in 60 seconds." |
| 2 | **Prerequisites** | 2 lines: `Docker`, `Docker Compose`. |
| 3 | **Single code block** | `git clone` → `docker-compose up -d` → `curl /v1/chat/completions`. JetBrains Mono, copy button. |
| 4 | **Full-guide link** | "Full guide → `docs/quickstart` ↗" (placeholder, links to GitHub). |

#### 3.4.5 About (`/about`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Born in a data center." |
| 2 | **Origin story** | 2–3 paragraphs. Anonymous data center. The "we kept rebuilding the same plumbing, so we extracted it" narrative. |
| 3 | **Why OSS** | 1 paragraph. MIT ethos — "infrastructure should be shared." |
| 4 | **Maintainers** | 1 line. "Maintained by an anonymous data center engineering team. PRs welcome." |
| 5 | **License** | `MIT © 2026` |

---

## 4. Visual System

### 4.1 Palette (Tailwind v4 config tokens)

| Token | Value | Usage |
|---|---|---|
| `bg-primary` | `#0B0E14` | Page background |
| `bg-surface` | `#11151C` | Cards / surfaces |
| `border` | `#1F2937` | Card borders, dividers |
| `text-primary` | `#E5E7EB` | Body text |
| `text-secondary` | `#94A3B8` | Sub text, captions |
| `accent` | `#06B6D4` | Primary accent (links, buttons, highlights) |
| `accent-hover` | `#22D3EE` | Hover / interaction state |
| `success` | `#10B981` | Status (e.g., "53 tests passed") |
| `danger` | `#EF4444` | Error states (if shown) |

### 4.2 Typography

- **Display / body**: `Inter` (weights 400 / 500 / 600 / 700)
- **Mono accent**: `JetBrains Mono` (code blocks, filenames, identifiers like `request_id`, `rate-limiting`)
- **Hero H1**: Inter 700, 72px desktop / 48px mobile
- **H2**: Inter 600, 40px
- **H3**: Inter 600, 24px
- **Body**: Inter 400, 16px, line-height 1.7
- **Caption**: Inter 400, 14px

### 4.3 Spacing & Layout

- 8px grid: `4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`
- Max content width: `1200px`, centered
- Section vertical padding: `96px` desktop / `48px` mobile

### 4.4 Component Library (8 components)

| # | Component | Purpose |
|---|---|---|
| 1 | `Nav.astro` | Sticky top nav. Semi-transparent dark + bottom border. |
| 2 | `Hero.astro` | Large headline + sub + 2 CTAs. |
| 3 | `Card.astro` | Module / feature card. Border → cyan on hover. |
| 4 | `Button.astro` | Variants: `Primary` (cyan filled), `Secondary` (border only), `Ghost` (text + arrow). |
| 5 | `CodeBlock.astro` | Dark bg + JetBrains Mono + copy button. Used 1–2 times only. |
| 6 | `ArchitectureDiagram.astro` | Full-width inline SVG architecture diagram. |
| 7 | `Footer.astro` | 3-column simple footer. |
| 8 | `Badge.astro` | Small pills (`v0.1`, `MIT`, `53 tests`). |

### 4.5 Module SVG Illustrations

Style: line + flat-color mix. Cyan primary (`#06B6D4`), dark gray (`#1F2937` / `#374151`), minimal bright colors. Geometric feel — squares, dots, grids, dashed lines, circuit-board vibe. Each ~200×200px.

| Module | Illustration concept |
|---|---|
| **Auth & Quota** | Abstract key + flow meter / dashboard gauge |
| **Observability** | Line chart + data points + grid |
| **Safety** | Shield + filter funnel + lock symbol |
| **Logging & Tracing** | Stacked documents + node connector lines + timeline axis |

---

## 5. Content Drafts

### 5.1 Hero (Home) — Primary

> **H1**: `Wrap your inference engine. Ship to production.`
>
> **Sub**: `Ultralisk gives every LLM API the four things no inference engine ships — auth, observability, safety, and logging. Decoupled from vLLM, TGI, or SGLang. MIT licensed.`
>
> **CTA 1**: `Quickstart →`
> **CTA 2**: `View on GitHub ↗`

### 5.2 Hero (Home) — Alternative

> **H1**: `Production-grade LLM infrastructure, out of the box.`

(More conservative, less sharp. Use primary unless feedback suggests otherwise.)

### 5.3 About — Origin Story

> Ultralisk started in our own data center. We had GPUs running open-source models, but turning that compute into a callable API kept meaning rebuilding the same plumbing — auth, rate limits, metrics, content moderation, request logs. Every team reinvented it. So we extracted our version.
>
> Ultralisk is that plumbing. It wraps your inference engine — vLLM, TGI, or SGLang — and gives you production-grade infrastructure behind a single endpoint. You keep the model. We handle the rest.
>
> We open-sourced it under MIT because infrastructure should be shared. Use it, fork it, ship it.

---

## 6. Technical Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Astro 7** (latest stable as of 2026-07) | Pin `astro@^7`. See [upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v7/). |
| Styling | **Tailwind v4** | CSS-first config. Integration via `@tailwindcss/vite`. |
| Content | **MDX** via `@astrojs/mdx` | For embedded components in content. |
| Language | **TypeScript** | |
| Deployment | **Cloudflare Pages** | GitHub auto-build, edge cache, free tier. |
| Fonts | Inter + JetBrains Mono via `@fontsource` (self-hosted) | No Google Fonts dependency. |

### 6.1 Astro 7 Configuration Notes

- Set `compressHTML: 'auto'` **explicitly** in `astro.config.mjs`. Astro 7's default `'jsx'` strips whitespace and may break the format of the Quickstart code block.
- Pin the Tailwind v4 + Astro 7 compatibility on first install; document any required versions in `website/README.md`.
- Use Astro **Content Collections** for the 5 page Markdown sources (`src/content/<page>.md`), then map them to `src/pages/<route>.astro`.

### 6.2 Project Location

`website/` directory at the repo root, isolated from `app/` / `gateway/` / `monitoring/` / `sql/`.

### 6.3 Repo Structure

```
website/
├── astro.config.mjs
├── tailwind.config.ts
├── package.json
├── tsconfig.json
├── README.md
├── public/
│   ├── favicon.svg
│   └── og-image.png
├── src/
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── ModuleCard.astro
│   │   ├── CodeBlock.astro
│   │   ├── ArchitectureDiagram.astro
│   │   └── Badge.astro
│   ├── content/
│   │   ├── home.md
│   │   ├── architecture.md
│   │   ├── modules.md
│   │   ├── quickstart.md
│   │   └── about.md
│   ├── layouts/
│   │   └── BaseLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── architecture.astro
│   │   ├── modules.astro
│   │   ├── quickstart.astro
│   │   └── about.astro
│   ├── styles/
│   │   └── global.css
│   └── assets/
│       └── illustrations/
│           ├── auth.svg
│           ├── observability.svg
│           ├── safety.svg
│           └── logging.svg
```

---

## 7. Out of Scope (v0.1)

These are explicitly **not** part of v0.1 and should not be built:

- A separate docs site (VitePress / Docusaurus / Astro Starlight). Placeholder links to GitHub suffice for now.
- i18n / Chinese version. English-only.
- Blog / changelog / news.
- Pricing / plans page.
- Search functionality.
- Light / dark theme toggle. Dark only.
- Analytics (Plausible, GA, etc.). Add later if useful.
- Custom domain / DNS configuration. Use the default Cloudflare Pages URL until a domain is decided.
- Email capture / newsletter.
- Case studies / customer logos / testimonials.
- "Sponsor" / "Support" page.

---

## 8. Acceptance Criteria

A v0.1 of the website is complete when **all** of the following are true:

1. All 5 pages (`/`, `/architecture`, `/modules`, `/quickstart`, `/about`) render and navigate correctly.
2. Home Hero displays with the locked copy from §5.1 and both CTAs.
3. Module cards display 4 distinct custom SVG illustrations matching §4.5.
4. The architecture diagram renders as inline SVG (no broken images, no external dependencies).
5. Quickstart has exactly one code block with a working copy-to-clipboard button.
6. The visual system matches §4.1 palette and §4.2 typography tokens.
7. `astro build` completes with no errors and no warnings about missing assets / fonts.
8. The site deploys to Cloudflare Pages on push to `main` and is reachable on the Pages-provided URL.
9. Lighthouse score ≥ 90 on Performance / Accessibility / Best Practices / SEO for the Home page on mobile.
10. All external links open in a new tab with `rel="noopener noreferrer"`.
11. `website/README.md` documents how to develop (`npm run dev`), build (`npm run build`), and deploy.
12. No code blocks appear outside Quickstart. Total code blocks site-wide: ≤ 2.

---

## 9. Open Questions / Future Considerations

Items intentionally deferred, captured here so they don't get lost:

- **Domain name** — `ultralisk.dev` is a placeholder; final TLD/registrar TBD.
- **Favicon & OG image** — required for sharing previews; design during implementation.
- **Wordmark / logo mark** — site currently uses text-only `Ultralisk` wordmark. A geometric mark (hexagon / circuit motif) can be added later without breaking the design.
- **Status / Roadmap page** — may be added once the project has more public-facing movement.
- **Sponsor / Support page** — can be added if/when sponsorship channels are set up.
- **Customer logos / case studies** — for v1.0 if the project gains real users.
- **Documentation site** — when `docs/` grows past what GitHub Markdown comfortably serves, consider Astro Starlight or Docusaurus.
- **Astro 7 + Tailwind v4 compatibility matrix** — verify at first `npm install`; pin versions in `package.json` if any issues surface.
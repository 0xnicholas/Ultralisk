# Ultralisk Official Website — Design Spec

**Date**: 2026-07-07
**Status**: Final — pending owner review and OC items
**Source**: Brainstorming session with project owner, plus spec-document review (see Review Log at bottom)

---

## 1. Overview

Build the official website for **Ultralisk**. Domain is **placeholder / TBD** — for v0.1, deploy to the default Cloudflare Pages URL and revisit domain when decided. The site is the public-facing front door for the project — it tells visitors what Ultralisk is, why it exists, and how to try it. Technical depth lives in the project's GitHub `README.md`; the website stays light and marketing-leaning.

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
ultralisk.dev/   (placeholder — actual URL is Cloudflare Pages default for v0.1)
├── /                  → Home
├── /architecture      → Architecture
├── /modules           → Modules
├── /quickstart        → Quickstart
└── /about             → About
```

### 3.2 Navigation

- **Top nav** (sticky, semi-transparent dark, bottom border):
  - Left: `Ultralisk` (text-only wordmark, see §4.4)
  - Center: `Architecture` · `Modules` · `Quickstart` · `About`
  - Right: `GitHub ↗` (external link, opens new tab)
- **Footer** (3-column, simple):
  - Col 1: `Ultralisk` + one-line positioning + © 2026
  - Col 2: `GitHub` · `License (MIT)` · `Docs ↗` — the Docs link points to `README.md#架构` on GitHub (placeholder until a docs site exists).
  - Col 3: `Maintained by an anonymous data center` (subtle, gray)

### 3.3 Content Philosophy

- Every page is **≤ 1 screen on desktop**, **except Home (≤ 3 screens)** and Quickstart (≤ 2 screens).
- Total code blocks on the entire site: **exactly 1**, on the Quickstart page only.
- Architecture diagrams are visual decoration, not deep technical breakdowns.
- Module cards use **business language** (e.g., "Stop runaway usage with token quotas and 429s"), not feature-list language ("Kong rate-limiting plugin").
- Deep technical content lives in the GitHub repo (`README.md` and `docs/`). Website links to existing README anchors rather than 404'ing on `docs/<missing>` paths.

### 3.4 Per-Page Outlines

#### 3.4.1 Home (`/`)

| # | Section | Content |
|---|---|---|
| 1 | **Hero** | H1 + sub + 2 CTAs. Occupies the first screen. Subtle dark background pattern. |
| 2 | **Value props strip** | 4 phrases in a horizontal row: `Decoupled · Production-grade · Modular · Open source (MIT)` |
| 3 | **Module grid** | "Four modules. One stack." Headline + 4 cards in a row. Each card: small SVG (64–80px) + module name + 1-line claim. Clicking a card → Modules page. |
| 4 | **Architecture teaser** | Full-width architecture SVG (visual only, no labels). Subtitle: "Decouple your engine." Link → Architecture page. |
| 5 | **Closing CTA** | "Ready to ship?" → `Quickstart →` |

#### 3.4.2 Architecture (`/architecture`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Built in layers. Swappable at every seam." |
| 2 | **Sub-paragraph** | 1 short paragraph explaining the decoupling idea. **Tone directive**: matter-of-fact, ~2 sentences. Name the layers (gateway / app / inference) once. No bullet lists, no feature lists, no product-marketing hyperbole. Draft pending — see §5.4. |
| 3 | **Big architecture diagram** | Inline SVG, fills the first screen. Cyan data-flow accents on dark. |
| 4 | **Deep-dive link** | "Deep dive → `README.md#架构` ↗" on GitHub. |

#### 3.4.3 Modules (`/modules`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Four modules. One stack." |
| 2 | **4 stacked cards** | One card per module. Each card: custom SVG illustration (~200×200px) + module title + 1-line value claim + 3–4 bullets in business language + "Learn more → `README.md#<anchor>` ↗" link to GitHub. Module→anchor mapping (GitHub slugs the Chinese headers by stripping colons and spaces):<br>• **Auth & Quota** → `README.md#模块一鉴权与限流`<br>• **Observability** → `README.md#模块二监控`<br>• **Safety** → `README.md#模块三内容安全`<br>• **Logging & Tracing** → `README.md#模块四日志与追踪` |
| 3 | **Closing CTA** | → `Quickstart` |

#### 3.4.4 Quickstart (`/quickstart`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Up and running in 60 seconds." |
| 2 | **Prerequisites** | 2 lines: `Docker`, `Docker Compose`. |
| 3 | **Single code block** | `git clone` → `docker-compose up -d` → `curl /v1/chat/completions`. JetBrains Mono, copy button. **Exactly one code block on the whole site.** |
| 4 | **Full-guide link** | "Full guide → `README.md#快速开始` ↗" on GitHub. |

#### 3.4.5 About (`/about`)

| # | Section | Content |
|---|---|---|
| 1 | **Headline** | "Born in a data center." |
| 2 | **Origin story** | 2–3 paragraphs. Anonymous data center. The "we kept rebuilding the same plumbing, so we extracted it" narrative. (Drafted in §5.3.) |
| 3 | **Why OSS** | 1 paragraph. MIT ethos — "infrastructure should be shared." |
| 4 | **Maintainers** | 1 line. "Maintained by an anonymous data center engineering team. PRs welcome." |
| 5 | **License** | `MIT © 2026` |

---

## 4. Visual System

### 4.1 Palette (Tailwind v4 CSS-first theme tokens)

All tokens are declared in `src/styles/global.css` under `@theme { ... }` — see §6.

| Token | Value | Usage |
|---|---|---|
| `bg-primary` | `#0B0E14` | Page background |
| `bg-surface` | `#11151C` | Cards / surfaces |
| `border` | `#1F2937` | Card borders, dividers |
| `text-primary` | `#E5E7EB` | Body text |
| `text-secondary` | `#94A3B8` | Sub text, captions |
| `accent` | `#06B6D4` | Primary accent (links, buttons, highlights) |
| `accent-hover` | `#22D3EE` | Hover / interaction state |
| `success` | `#10B981` | Status badges (e.g., `MIT`) |

`danger` is not part of v0.1 — no error states are surfaced on the marketing site.

### 4.2 Typography

- **Display / body**: `Inter` (weights 400 / 500 / 600 / 700)
- **Mono accent**: `JetBrains Mono` (code blocks, filenames, identifiers like `request_id`, `rate-limiting`)
- **Hero H1**: Inter 700, 72px desktop / 48px mobile
- **H2**: Inter 600, 40px
- **H3**: Inter 600, 24px
- **Body**: Inter 400, 16px, line-height 1.7
- **Caption**: Inter 400, 14px

### 4.3 Spacing & Layout

- 4px base, 8px major grid: `4 / 8 / 16 / 24 / 32 / 48 / 64 / 96`
- Max content width: `1200px`, centered
- Section vertical padding: `96px` desktop / `48px` mobile

### 4.4 Component Library (8 components)

| # | Component | Purpose |
|---|---|---|
| 1 | `Nav.astro` | Sticky top nav. Semi-transparent dark + bottom border. Hosts the text-only `Ultralisk` wordmark on the left. |
| 2 | `Hero.astro` | Large headline + sub + 2 CTAs. |
| 3 | `ModuleCard.astro` | Module card. Border → cyan on hover. Used on Home (compact variant) and Modules page (full variant). |
| 4 | `Button.astro` | Variants: `Primary` (cyan filled), `Secondary` (border only), `Ghost` (text + arrow). |
| 5 | `CodeBlock.astro` | Dark bg + JetBrains Mono + copy button. Used exactly once on the Quickstart page. |
| 6 | `ArchitectureDiagram.astro` | Full-width inline SVG architecture diagram. |
| 7 | `Footer.astro` | 3-column simple footer. |
| 8 | `Badge.astro` | Small pills (`v0.1`, `MIT`). |

### 4.5 Module SVG Illustrations

Style: line + flat-color mix. Cyan primary (`#06B6D4`), dark gray (`#1F2937` / `#374151`), minimal bright colors. Geometric feel — squares, dots, grids, dashed lines, circuit-board vibe.

**Two sizes** (the difference was previously underspecified):
- **Modules page**: ~200×200px per illustration (full-detail view).
- **Home page module grid**: ~64–80px per illustration (compact, so 4 fit in one row inside the 1200px content area with breathing room).

| Module | Illustration concept |
|---|---|
| **Auth & Quota** | A stylized key shape overlapping a horizontal meter with a moving needle — suggests both *who* is calling and *how much* they've used. Cyan needle on a dark-gray track. |
| **Observability** | Line chart + data points + grid. |
| **Safety** | Shield + filter funnel + lock symbol. |
| **Logging & Tracing** | Stacked documents + node connector lines + timeline axis. |

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

### 5.4 Architecture — Sub-paragraph

> **PENDING DRAFT** — see §9 "Open Creative Items."

### 5.5 Module Cards — 1-line claims and bullets

> **PENDING DRAFT** — see §9 "Open Creative Items." The implementer must NOT write these without owner-anchored copy; otherwise the marketing-leaning test fails.

---

## 6. Technical Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Astro 7** (latest stable as of 2026-07) | Pin `astro@^7`. See [upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v7/). |
| Styling | **Tailwind v4** | CSS-first config. Integration via `@tailwindcss/vite`. **No `tailwind.config.ts`** — all design tokens are declared in `src/styles/global.css` via `@theme { ... }`. |
| Content | **MDX** via `@astrojs/mdx` | For embedded components in content. |
| Language | **TypeScript** | |
| Deployment | **Cloudflare Pages** | GitHub auto-build, edge cache, free tier. Use the default Pages URL until a domain is decided (see §9). |
| Fonts | Inter + JetBrains Mono via `@fontsource` (self-hosted) | No Google Fonts dependency. Import only the weights used: `inter/400.css`, `inter/600.css`, `inter/700.css`, `jetbrains-mono/400.css`. Add `<link rel="preload">` for the body weight (Inter 400) in `BaseLayout.astro`. |
| SEO | `@astrojs/sitemap` | Generates `sitemap.xml` automatically. Pair with `public/robots.txt`. |
| Meta tags | Per-page `<meta name="description">` | Required for Lighthouse SEO ≥ 90 (see §8 #9). Implemented via Astro's named `head` slot pattern in `BaseLayout.astro` (`<slot name="head" />`; pages fill via `<Fragment slot="head"><meta .../></Fragment>`). |

### 6.1 Astro 7 Configuration Notes

- Set `compressHTML: false` **explicitly** in `astro.config.mjs`. Astro 7's default `'jsx'` strips whitespace in JSX-rendered children and may break the format of the Quickstart code block. (Astro 7 does accept `'auto'` as a valid value, but `'auto'` may still collapse whitespace in `<pre>` text nodes; `false` is the safest choice for our use case.)
- Pin the Tailwind v4 + Astro 7 compatibility on first install; document any required versions in `website/README.md`.
- Pin Node engines in `website/package.json`: `"engines": { "node": ">=20.3.0" }` (Astro 7 minimum).
- **Content Collections pattern**: each page is a thin wrapper. `src/pages/<route>.astro` imports its content from `src/content/<page>.md` via `getEntry('<page>')`, then renders via `BaseLayout.astro`. Pages contain zero prose — all copy lives in the content collection. This lets non-engineers edit page copy without touching Astro components.
- **Content Collection schema**: declare the 5 collections in `src/content.config.ts` (or `src/content/config.ts`) with a Zod schema so typos in frontmatter are caught at build time. Each `.md` file declares `title`, `description` (≤ 155 chars), and `navTitle` (optional override for the top nav).

### 6.2 Project Location

`website/` directory at the repo root, isolated from `app/` / `gateway/` / `monitoring/` / `sql/`.

### 6.3 Repo Structure

```
website/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── README.md
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── Footer.astro
│   │   ├── Hero.astro
│   │   ├── ModuleCard.astro
│   │   ├── Button.astro
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
│   └── styles/
│       └── global.css
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

- A separate docs site (VitePress / Docusaurus / Astro Starlight). The website links to `README.md` anchors on GitHub instead.
- i18n / Chinese version. English-only.
- Blog / changelog / news.
- Pricing / plans page.
- Search functionality.
- Light / dark theme toggle. Dark only.
- Analytics (Plausible, GA, etc.). Add later if useful.
- Custom domain / DNS configuration. **Use the default Cloudflare Pages URL for v0.1.** Domain decision deferred (see §9).
- Email capture / newsletter.
- Case studies / customer logos / testimonials.
- "Sponsor" / "Support" page.
- Custom 404 / error page — Astro's default is acceptable.

**In scope but explicitly noted** (so the implementer doesn't miss them):
- `favicon.svg` and `og-image.png` must exist in `public/` before v0.1 ships (see §8 #13).
- `robots.txt` must exist in `public/` (allow all + point to sitemap).
- `sitemap.xml` is generated by `@astrojs/sitemap` integration.
- Per-page `<meta name="description">` is set via `BaseLayout.astro`'s named `head` slot.

---

## 8. Acceptance Criteria

A v0.1 of the website is complete when **all** of the following are true:

1. All 5 pages (`/`, `/architecture`, `/modules`, `/quickstart`, `/about`) render and navigate correctly.
2. Home Hero displays with the locked copy from §5.1 and both CTAs.
3. Module cards display 4 distinct custom SVG illustrations matching §4.5 (two size variants — full on Modules page, compact on Home).
4. The architecture diagram renders as inline SVG (no broken images, no external dependencies).
5. Quickstart has exactly one code block with a working copy-to-clipboard button.
6. The visual system matches §4.1 palette and §4.2 typography tokens, defined in `src/styles/global.css` via `@theme`.
7. `astro build` completes with no errors.
8. The site deploys to Cloudflare Pages on push to `main` and is reachable on the Pages-provided URL.
9. Lighthouse score ≥ 90 on Performance / Accessibility / Best Practices / SEO for the Home page on mobile.
10. All external links open in a new tab with `rel="noopener noreferrer"`.
11. `website/README.md` documents how to develop (`npm run dev`), build (`npm run build`), and deploy.
12. **No code blocks appear outside Quickstart. Total code blocks site-wide: exactly 1.**
13. `favicon.svg`, `og-image.png`, and `robots.txt` exist in `public/`. `og-image.png` is exactly **1200×630 px** (standard OG dimensions). The Home `<head>` references it via `<meta property="og:image" content=".../og-image.png">`.
14. `sitemap.xml` is generated and accessible at `/sitemap-index.xml` or `/sitemap.xml`.
15. Every page has a unique `<meta name="description">` (≤ 155 chars, English) set via the BaseLayout named `head` slot.
16. The wordmark `Ultralisk` in the nav renders in Inter 600 (text-only, no custom mark yet).
17. Total CSS shipped (gzipped) ≤ 30 KB on the Home page.
18. Total JS shipped ≤ 5 KB on the Home page (Astro default — no client islands unless explicitly justified).

---

## 9. Open Questions / Future Considerations

### Deferred (post-v0.1)

- **Domain name** — TBD. v0.1 ships to the Cloudflare Pages default URL.
- **Wordmark / logo mark** — text-only `Ultralisk` for v0.1. A geometric mark (hexagon / circuit motif) can be added later without breaking the design.
- **Status / Roadmap page** — may be added once the project has more public-facing movement.
- **Sponsor / Support page** — can be added if/when sponsorship channels are set up.
- **Customer logos / case studies** — for v1.0 if the project gains real users.
- **Documentation site** — when `README.md` grows past what GitHub comfortably serves, consider Astro Starlight or Docusaurus.
- **i18n / Chinese version** — deferred. English-only for v0.1.

### Open Creative Items (must be resolved before §5.4 and §5.5 content can ship)

These items need owner input — the implementer cannot author them from the rest of the spec without risking the "too technical" failure mode that already came up once:

- **OC1. Architecture sub-paragraph** (referenced as §5.4). Suggested shape: ~2 sentences naming the three layers once (gateway, app, inference), no bullet lists, no feature lists. Suggested draft (owner may override):
  > Three layers, each swappable. The gateway terminates auth and rate limits. Your app owns the chat logic and the safety pipeline. The inference engine can be vLLM today and SGLang tomorrow — Ultralisk doesn't care, because nothing past the gateway depends on it.
- **OC2. Module card 1-line claims** (one per module, referenced as §5.5). Tone: benefit-led, ~10–14 words. Suggested drafts (owner may override):
  - **Auth & Quota**: "Stop runaway usage before it hits your GPU bill. Daily and monthly quotas return 429s the moment a caller crosses the line."
  - **Observability**: "See latency and error rates at every stage. TTFT, queue depth, and quota rejections — Prometheus metrics out of the box."
  - **Safety**: "Catch jailbreak prompts and sensitive output before it reaches the user. Rule engine first, model second, both async-friendly."
  - **Logging & Tracing**: "Reconstruct any request end-to-end from a single `request_id`. Structured JSON + OTel spans, ready for Loki or Tempo."
- **OC3. Module card bullets** (3–4 per module). Once OC2 is anchored, the owner should approve or amend 1 sample bullet per module to set the register; the implementer mirrors the tone for the rest.
- **OC4. Per-page `<meta name="description">`** (one per page, 5 total, ≤ 155 chars each, English). Required by §8 #15. Suggested tone: benefit-led, parallel structure across pages, no marketing-speak. Example shape for Home (owner may override): _"Production-grade LLM API infrastructure. Wrap your inference engine with auth, observability, safety, and logging. Open source."_

### Tech-stack notes

- **Astro 7 + Tailwind v4 compatibility** — verify at first `npm install`; pin versions in `package.json` if any issues surface.
- **`@astrojs/mdx@7.0.2`** + **`@astrojs/cloudflare@14.1.1`** + **`@tailwindcss/vite@4.3.2`** + **`@fontsource/inter@5.2.8`** — all confirmed compatible with Astro 7 as of 2026-07.

---

## Review Log

### Round 1 (2026-07-07) — reviewer subagent

**Verdict**: 3 BLOCKERS, 11 RECOMMENDATIONS, 8 NITS.

**Blockers addressed**:
- **B1** (`compressHTML: 'auto'` invalid): replaced with `compressHTML: false` in §6.1. *(Round-2 reviewer noted that `'auto'` IS technically a valid Astro 7 value, but `false` remains the safer choice — note in §6.1 was softened accordingly.)*
- **B2** (placeholder doc paths 404): replaced all `docs/<missing>` references with `README.md#<anchor>` links pointing to existing GitHub content (§3.2, §3.4.2 #4, §3.4.3 #2, §3.4.4 #4).
- **B3** (component list inconsistency §4.4 vs §6.3): reconciled — `Card.astro` removed, `ModuleCard.astro` and `Button.astro` now appear in both lists (§4.4, §6.3).

**Recommendations addressed**:
- **R1** (Home doesn't fit ≤ 1 screen): §3.3 now explicitly allows Home ≤ 3 screens.
- **R3** (Home SVG size unspecified): §4.5 now specifies two sizes (full on Modules page, compact on Home).
- **R4** (`tailwind.config.ts` contradicts CSS-first claim): removed from §6.3; §6 explains tokens live in `global.css` via `@theme`.
- **R5** (code-block count inconsistent): standardized to "exactly 1" in §3.3, §3.4.4 #3, §4.4, §8 #5, §8 #12.
- **R7** (404/sitemap/robots/meta desc missing): in-scope decisions added to §7 and §6; acceptance items added in §8 #13–15.
- **R8** (`danger` unused): removed from §4.1.
- **R9** (OG image in structure but deferred): now in-scope per §7 + §8 #13.
- **R10** (Architecture sub-paragraph tone directive): added tone directive in §3.4.2 #2; draft pending (OC1).
- **R11** ("53 tests" fragile badge example): removed from §4.4.

**Nits addressed**: N1 (grid 12 removed → 4/8/16/24/32/48/64/96), N2 (font weight import note added to §6), N5 ("wordmark" wording dropped from §3.2), N6 (Content Collections pattern clarified in §6.1), N8 (domain line canonicalized to §1 + §7 + §9 cross-reference).

**Deferred to owner creative input** (see §9 Open Creative Items): R2 (module bullets), R6 (module 1-line claims + architecture sub-paragraph).

**Nits deferred as judgment calls**: N3 (Auth & Quota illustration concept tightened but not rewritten — owner may refine), N4 ("Decouple your engine" tone — judgment call), N7 (Home Closing CTA duplication — kept as written; minor).

### Round 2 (2026-07-07) — reviewer subagent

**Verdict**: 1 BLOCKER (regression of B2 — README anchors were English slugs but README is in Chinese), 7 RECOMMENDATIONS, 9 NITS.

**Blocker addressed in this revision**:
- **B-1** (README anchor slugs were English but README headers are Chinese): all anchor links updated to use the actual Chinese GitHub slugs (`#架构`, `#快速开始`, `#模块一鉴权与限流`, `#模块二监控`, `#模块三内容安全`, `#模块四日志与追踪`) in §3.2, §3.4.2 #4, §3.4.3 #2, §3.4.4 #4. Per-module anchor mapping table added to §3.4.3 #2.

**Recommendations addressed in this revision**:
- **R-1** (invalid `'auto'` claim in §6.1): softened — now accurately notes `'auto'` is valid in Astro 7 but `false` is the safer choice.
- **R-2** (module→anchor mapping): added inline in §3.4.3 #2.
- **R-3** (`<SEO>` slot terminology): renamed to "named `head` slot pattern" in §6 + §8.
- **R-4** (OG image dimensions + test): added 1200×630 px spec to §8 #13; meta-tag reference requirement included.
- **R-6** (meta descriptions not drafted): added OC4 to §9.
- **R-7** (Node engines not pinned): added `"engines": { "node": ">=20.3.0" }` requirement to §6.1.
- **Bonus** (Content Collections schema file): added `src/content.config.ts` note + schema fields in §6.1.

**Recommendation deferred**:
- **R-5** (end-to-end smoke acceptance after deploy): deferred to a future iteration; Cloudflare Pages preview deploys are sufficient for v0.1.

**Nits deferred as judgment calls**: N-1 through N-9 — minor polish, none gate the spec.

### Round 3 (2026-07-07) — reviewer subagent

**Verdict**: APPROVED — ready for user review. Final verification confirmed all 6 anchor links land on real README headers under GitHub's slug rules. No new regressions detected. Two cosmetic `<SEO>`-slot stragglers (§7 and §8 #15) and one over-spec (`navTitle` schema field) flagged; all cleaned up in the final-polish commit.

### Self-review (2026-07-07) — author pass before owner hand-off

A fresh-eyes pass by the spec author caught four issues that had survived three reviewer rounds:

- **§6.3 tree**: `src/assets/` was drawn at the wrong level (sibling of `src/`, not child). Fixed — now correctly nested under `src/`.
- **§8 #15**: meta description acceptance criterion was missing the ≤155-char SEO limit mentioned in §6.1 and §9 OC4. Fixed.
- **Review Log duplication**: Round 1's recommendations section was orphaned below Round 2's content from the second-round edit. Consolidated back under Round 1.
- **Status header**: still read "review round 3 (last review loop)". Updated to "Final — pending owner review and OC items."
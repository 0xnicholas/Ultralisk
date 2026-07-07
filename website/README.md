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

### Cloudflare Pages setup (one-time)

1. Log in to https://dash.cloudflare.com/
2. Pages → Create application → Connect to Git → select `nicholasli/ultralisk`
3. Build settings:
   - **Framework preset**: Astro
   - **Root directory**: `website`
   - **Build command**: `npm install && npm run build`
   - **Build output directory**: `dist`
   - **Node version**: 20 (or higher)
4. Environment variables: none required for v0.1
5. Save and deploy

Future pushes to `main` will auto-deploy.

> **Important:** When `Root directory` is set to `website`, all other paths are interpreted relative to it. So the build command should NOT `cd website` (you're already there), and the output directory is just `dist` (not `website/dist`).

## Project structure

See [`docs/superpowers/specs/2026-07-07-ultralisk-website-design.md`](../specs/2026-07-07-ultralisk-website-design.md) for the full design spec.

```
website/
├── astro.config.mjs        # Astro 7 + MDX + sitemap + Tailwind v4
├── package.json            # Pinned deps + Node engines
├── public/                 # favicon, og-image, robots.txt (static assets)
└── src/
    ├── components/         # 8 .astro components (Nav, Hero, ModuleCard, etc.)
    ├── content/            # 5 .md files (Content Collections source)
    ├── layouts/            # BaseLayout.astro
    ├── pages/              # 5 .astro pages (one per route)
    ├── assets/illustrations/ # 4 module SVG illustrations
    ├── content.config.ts   # Content Collections Zod schema
    └── styles/global.css   # Tailwind v4 theme tokens + base styles
```

## Contributing

- All page copy lives in `src/content/*.md` (Content Collections).
- All shared UI lives in `src/components/*.astro`.
- Theme tokens live in `src/styles/global.css` under `@theme { ... }`.

Edits to copy don't require a build review. Edits to components or styles should be reviewed.
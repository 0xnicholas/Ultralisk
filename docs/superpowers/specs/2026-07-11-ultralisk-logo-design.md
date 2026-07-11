# Ultralisk Logo — Design Spec

**Date**: 2026-07-11
**Status**: Approved (v1.0)
**Scope**: Brand mark for the Ultralisk Console project.

---

## 1. Concept

Two symmetric scythe blades crossing in an X. Direct visual reference to the
Ultralisk unit from StarCraft (the project's namesake), rendered as clean
geometric lens shapes rather than literal creature anatomy — modern, abstract,
and aggressive enough to read as a brand mark rather than clip-art.

The X carries two meanings simultaneously:

1. **Top-tier capability** — the Ultralisk is the Zerg's apex melee unit; the X
   signals "flagship" without spelling it out.
2. **Crossed inference + orchestration** — Ultralisk combines Together AI's
   inference layer with Chamber-style GPU orchestration; two blades, two
   capabilities, one platform.

## 2. Geometry

| Property         | Value                                  |
| ---------------- | -------------------------------------- |
| Canvas           | `viewBox="0 0 100 100"`                |
| Symmetry         | Bilateral across both X and Y axes     |
| Outer tips       | `(12, 12)`, `(88, 12)`, `(12, 88)`, `(88, 88)` |
| Crossing point   | `(50, 50)`                             |
| Mid-blade bulge  | 12 units perpendicular from centerline |
| Corner padding   | 12% (safe-area margin)                 |

Each blade is a lens shape constructed from two cubic Bezier arcs. Blade 1
runs top-left → bottom-right; Blade 2 is its vertical mirror (top-right →
bottom-left). The two lenses overlap at the center to form a thick X.

## 3. Color

Default diagonal gradient, top-left → bottom-right:

| Stop   | Color      | Hex       | Role                       |
| ------ | ---------- | --------- | -------------------------- |
| 0%     | Violet 500 | `#7C3AED` | Origin / "platform"       |
| 100%   | Cyan 400   | `#22D3EE` | Frontier / "inference"    |

The gradient direction matches the dominant diagonal of the mark itself, so
the blade and its highlight read as one element.

### Variants

| Variant          | Gradient end-stops            | Notes                              |
| ---------------- | ----------------------------- | ---------------------------------- |
| `logo.svg`       | `#7C3AED` → `#22D3EE`         | Default. Use first.                |
| `logo-on-dark`   | `#A78BFA` → `#67E8F9`         | Brighter; subtle outer glow.       |
| `logo-on-light`  | `#5B21B6` → `#0E7490`         | Deeper; no glow.                   |
| `logo-mono`      | `currentColor`                | Solid; inherits CSS text color.    |

## 4. Variants & file inventory

All four SVG files live in `brand/` at the project root:

- `brand/logo.svg`
- `brand/logo-on-dark.svg`
- `brand/logo-on-light.svg`
- `brand/logo-mono.svg`

`brand/README.md` documents usage (HTML, JSX, favicon, monochrome inheritance).

## 5. Usage rules

- **Minimum size**: 16 × 16 px. Below this, prefer a rasterized derivative of
  `logo-mono.svg` for crisp edges on the diagonal blade tips.
- **Clear space**: 12% of the logo width on every side. The blade tips define
  the inscribed safe-area.
- **Don'ts**: no rotation, no gradient angle change, no drop shadows / 3D /
  outlines, no off-palette recoloring, no busy backgrounds without a backing
  plate.

## 6. Future extensions (YAGNI for now)

If / when needed, the mark is designed to extend cleanly into:

- A horizontal lockup with the `ULTRALISK` wordmark beside the icon.
- A square favicon plate (icon centered in a rounded square with a subtle
  violet fill — still no glow, still no shadow).
- An animated loading variant where the two blades pulse in counter-phase.

These are intentionally **not** delivered in v1.0 — none are required for the
current Console MVP, and adding them now risks a half-baked system. Re-evaluate
when marketing surfaces or animated loading states ship.

## 7. Decisions log

| Decision                                | Why                                          |
| --------------------------------------- | -------------------------------------------- |
| Icon-led, no wordmark in v1.0           | Wordmark adds maintenance; not in MVP scope. |
| Symmetric lens blades, not asymmetric scythes | Symmetry reads as logo, not illustration. |
| Gradient on diagonal, not radial        | Diagonal mirrors the blade axis.             |
| Violet → cyan, not blue → cyan          | Violet signals AI / Together AI family.      |
| 4 variants, not 6                       | Cover dark / light / mono / default; that's it. |
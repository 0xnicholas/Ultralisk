# Ultralisk Brand Assets

Logo files for the Ultralisk project.

## Files

| File                  | Purpose                                                                | Best on                  |
| --------------------- | ---------------------------------------------------------------------- | ------------------------ |
| `logo.svg`            | Default. Diagonal violet → cyan gradient.                               | Any background ≥ 4.5:1 contrast |
| `logo-on-dark.svg`    | Brighter stops + subtle outer glow for low-luminance surfaces.          | Dark backgrounds (#0A0A0A, #111827) |
| `logo-on-light.svg`   | Deeper stops for contrast on white / cream surfaces.                    | Light backgrounds (#FAFAFA, #FFFFFF) |
| `logo-mono.svg`       | `currentColor`-driven — inherits from the surrounding text color.       | Print, single-color contexts |

## Usage

### HTML

```html
<!-- Default (works on most backgrounds) -->
<img src="/brand/logo.svg" alt="Ultralisk" width="32" height="32" />

<!-- On a dark hero / footer -->
<img src="/brand/logo-on-dark.svg" alt="Ultralisk" width="32" height="32" />

<!-- On a light marketing surface -->
<img src="/brand/logo-on-light.svg" alt="Ultralisk" width="32" height="32" />

<!-- Inline, color-controlled via CSS -->
<svg class="logo"><use href="/brand/logo-mono.svg#root" /></svg>
```

### React / JSX

```tsx
import Logo from '@/brand/logo.svg'; // configure your bundler for SVG imports

<img src={Logo} alt="Ultralisk" className="h-8 w-8" />
```

### Favicon

```html
<link rel="icon" type="image/svg+xml" href="/brand/logo.svg" />
<link rel="apple-touch-icon" href="/brand/logo.svg" />
```

Modern browsers (Chrome 80+, Firefox, Safari) support SVG favicons. `logo-mono.svg` is also a safe fallback if the favicon must adapt to the browser chrome.

### Monochrome (currentColor)

```css
.brand-mark { color: #0A0A0A; }       /* black on light */
.brand-mark.invert { color: #FAFAFA; } /* white on dark */
```

```html
<object data="/brand/logo-mono.svg" type="image/svg+xml" class="brand-mark"></object>
```

## Minimum size

- **favicon**: 16 × 16 px (use `logo-mono.svg` or a rasterized derivative for maximum clarity at this size)
- **app icon / hero**: 32 × 32 px and above
- **lockup / marketing**: 64 × 64 px and above

The mark stays legible down to ~16 × 16 because the crossing point anchors the silhouette.

## Clear space

Reserve a margin equal to **12% of the logo width** (≈ the size of one blade tip's offset from the corner) on every side. Nothing else should intrude into this area.

## Color tokens

| Token                | Hex       | Where it appears           |
| -------------------- | --------- | -------------------------- |
| `ultralisk.violet.500` | `#7C3AED` | Gradient start (default)   |
| `ultralisk.cyan.400`   | `#22D3EE` | Gradient end (default)     |
| `ultralisk.violet.400` | `#A78BFA` | Dark variant gradient start |
| `ultralisk.cyan.300`   | `#67E8F9` | Dark variant gradient end   |
| `ultralisk.violet.700` | `#5B21B6` | Light variant gradient start |
| `ultralisk.cyan.700`   | `#0E7490` | Light variant gradient end   |
| `ink.900`              | `#0A0A0A` | Mono default on light bg    |
| `ink.50`               | `#FAFAFA` | Mono default on dark bg     |

## Don'ts

- Don't rotate the mark.
- Don't change the gradient angle (top-left → bottom-right is part of the identity).
- Don't add drop shadows, outlines, or 3D effects.
- Don't fill with a different palette (use the variants in this folder).
- Don't place on busy photographic backgrounds without a backing plate.

## License

Internal brand asset — use freely within Ultralisk products and marketing.
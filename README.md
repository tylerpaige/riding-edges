# Riding edges

## Objective

This project is a **single-page** experience where **vertical scrolling** drives a **fixed square** that travels from the **viewport’s bottom-left** to the **top-right**. The square **stays square** for the whole animation, **grows in the middle** of the scroll (then shrinks back to the ending size), and **fills with more copy** as space allows. Text layout is measured **without repeated DOM reads** using [Pretext](https://github.com/chenglou/pretext), and scroll scrubbing uses [GSAP ScrollTrigger](https://greensock.com/docs/v3/Plugins/ScrollTrigger/).

All animation behavior and copy are controlled from one exported object in [`src/main.ts`](src/main.ts): `animationConfig`.

## Configuration

Edit **`animationConfig`** in [`src/main.ts`](src/main.ts).

| Option | Type | Description |
| --- | --- | --- |
| `script` | `string[]` | **Logical segments** of the story. Segments are joined with spaces in order. How many segments are *eligible* to show grows with scroll progress; how many actually render is capped by what fits inside the square (see below). |
| `startSize` | `string` | Side length at **scroll start** (`t = 0`). Supports CSS-like lengths, e.g. `1em`, `16px`. `em` is resolved against the square’s `font-size` (16px). |
| `endSize` | `string` | Side length at **scroll end** (`t = 1`). Same parsing rules as `startSize`. |
| `scrollPixelsPerPercent` | `number` | Together with `scrollHeightMultiplier`, sets how **tall** the page is beyond one viewport. Total extra scroll distance is **`100 × scrollPixelsPerPercent × scrollHeightMultiplier`** pixels. The document uses `min-height: calc(100vh + that distance)` so scroll progress maps cleanly to `t ∈ [0, 1]`. |
| `scrollHeightMultiplier` | `number` | Scales the extra scroll distance from `scrollPixelsPerPercent` (default `1`). |
| `peakScale` | `number` | Extra **mid-scroll** size added as **`peakScale × min(vw, vh) × sin(πt)`** on top of the linear interpolation between start and end side lengths. At `t = 0` and `t = 1` the sine term is zero, so the square still matches `startSize` / `endSize` at the ends. |
| `maxSizeFraction` | `number` | Hard cap: side length never exceeds **`maxSizeFraction × min(vw, vh)`** so the square stays on screen. |
| `paddingPx` | `number` | Inner padding (pixels) for the text block inside the square. |
| `lineHeightPx` | `number` | Line height in **pixels** for Pretext layout. **Keep in sync** with the `.square-text` `leading-[…]` class in [`src/main.ts`](src/main.ts). |
| `pretextFont` | `string` | Canvas-style **font** string passed to Pretext’s `prepare()`. **Must match** the visual `font` of `.square-text` (size, weight, family). Pretext’s docs recommend a **named** font stack (not `system-ui`) for consistent measurement. |

### Segment visibility

- A **desired** segment count comes from scroll: `ceil(t × script.length)` (clamped), so more of the script unlocks as you scroll.
- The **rendered** count is the largest number of leading segments whose Pretext-measured height fits in the **inner** width and height (side length minus padding). If the box is still too small, fewer segments show even if scroll “wants” more.

## Approach

### Scroll and timing

- **GSAP ScrollTrigger** (`scrub: true`) tracks scroll through the full document and exposes **`progress`** in `[0, 1]`, which is treated as **`t`**.
- The page height is set via CSS variable **`--scroll-doc-height`**: `calc(100vh + scrollRangePx)` where `scrollRangePx = 100 × scrollPixelsPerPercent × scrollHeightMultiplier`.

### Square geometry

- The square is **`position: fixed`** with equal **width** and **height** and `aspect-square` as a safeguard.
- **Side length** `s(t)`: linear blend from resolved `startSize` to `endSize`, plus the **`peakScale` × sin(πt)** term, then clamped by **`maxSizeFraction`**.
- **Position**: the bottom-left placement is interpolated toward the top-right using  
  `left = (vw − s) × t` and `bottom = (vh − s) × t`.  
  At `t = 0` the square sits in the bottom-left; at `t = 1` it sits in the top-right, still square. Along the way, edges stay in contact with the viewport boundary in a way consistent with sliding along that diagonal (the implementation follows the plan’s blended **L-anchor** idea: from bottom/left toward top/right).

### Text with Pretext

- For each candidate prefix of segments, the app uses **`prepare(text, pretextFont)`** once per distinct string (cached), then **`layout(prepared, innerWidth, lineHeight)`** to get height.
- A **binary search** finds the maximum number of leading segments that still fit in the inner box. That avoids `getBoundingClientRect` / layout thrash for measuring text, in line with [Pretext’s design](https://github.com/chenglou/pretext).
- On resize or after fonts load, **ScrollTrigger** is refreshed and the frame is reapplied.

### Build

- **TypeScript** is bundled with **esbuild**; **Tailwind v4** is compiled with **PostCSS** (`@tailwindcss/postcss`). **`pnpm dev`** runs a one-time **`build`**, then watches CSS and JS and serves **`dist`** on port **5173**.

## Requirements

- **Node.js** 24+ (see `engines` in [`package.json`](package.json))
- **pnpm**

## Commands

```bash
pnpm install
pnpm dev      # build once, then watch + serve at http://localhost:5173
pnpm build    # dist/styles.css, dist/app.js, dist/index.html
pnpm preview  # build then serve dist
```

## Dev container

See [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json): Node 24 image, `pnpm install` after create, port **5173** forwarded.

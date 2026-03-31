# Riding the edges

## Objective

A single-page experience where vertical scrolling drives a fixed-width rectangle — rotated −45° — that travels from the viewport's bottom-left corner to the top-right. The box grows taller through the middle of the scroll (then shrinks back), and fills with more copy as space allows. Text layout is measured without DOM reads using [Pretext](https://github.com/chenglou/pretext); scroll scrubbing uses [GSAP ScrollTrigger](https://greensock.com/docs/v3/Plugins/ScrollTrigger/).

All animation behaviour and copy are controlled from [`src/config.ts`](src/config.ts).

## Configuration

Edit `animationConfig` in [`src/config.ts`](src/config.ts).

### Box & scroll

| Option | Type | Description |
| --- | --- | --- |
| `script` | `string \| string[]` | Copy shown inside the box. A plain string is split on whitespace into words; an array treats each element as one segment. Segments are joined with spaces. How many are visible at any moment is determined purely by fit — see [Segment visibility](#segment-visibility). |
| `rectWidth` | `string` | Fixed **unrotated width** of the box for the whole animation. Supports `px`, `em`, `rem`, `vw`, `vh`, `vmin`, `vmax`. |
| `minRectHeight` | `string` | Minimum **unrotated height** of the box (the height used at the start and end of the scroll). Same length syntax as `rectWidth`. |
| `maxHeightFraction` | `number` | Scales the upper bound when solving for the box height in each phase. Default `1`. |
| `scrollPixelsPerPercent` | `number` | Controls total page height. Extra scroll distance is `100 × scrollPixelsPerPercent × scrollHeightMultiplier` px. |
| `scrollHeightMultiplier` | `number` | Additional multiplier on the scroll range (default `1`). |
| `paddingPx` | `number` | Inner padding (px) subtracted from both dimensions before text layout. |
| `lineHeightPx` | `number` | Line height in px for Pretext layout. **Keep in sync** with the `leading-[…]` class on `.square-text` in [`src/styles.css`](src/styles.css). |
| `pretextFont` | `string` | Canvas-style font string passed to Pretext. Must match the visual font of `.square-text` (size, weight, family). |

### Trail

A canvas behind the box paints a ghost rectangle at every position the box visits, leaving a visible trail.

| Option | Type | Description |
| --- | --- | --- |
| `trailEnabled` | `boolean` | Set to `false` to disable the trail entirely. |
| `trailColor` | `string \| string[]` | CSS color(s) for ghost rectangles. An array cycles through the colors in order. |
| `trailFadeDelay` | `number` | How long (ms) each ghost stays at full opacity before fading. `Infinity` (the default) means ghosts never fade and accumulate permanently. |
| `trailFadeDuration` | `number` | Duration (ms) of the fade-out after the delay. `0` means instant disappearance. Ignored when `trailFadeDelay` is `Infinity`. |

### Debug

| Option | Type | Description |
| --- | --- | --- |
| `debug` | `boolean` | Shows a geometry debug overlay and exposes `window.__ridingEdgesDebug`. Also enabled by adding `?debug=1` to the URL. |

### Segment visibility

Segments are always candidates to show; the visible count is simply the largest number of leading segments whose Pretext-measured height fits in the current inner box. As the box grows through scroll, more text becomes visible.

## Approach

### Scroll and timing

**GSAP ScrollTrigger** (`scrub: true`) maps scroll position to a normalised progress value `t ∈ [0, 1]`. The page height is set via the CSS variable `--scroll-doc-height: calc(100vh + scrollRangePx)`.

### Box geometry

The box is `position: fixed`, has a **fixed unrotated width** (`rectWidth`) and a **variable unrotated height**, and is rotated **−45°** around its centre. The animation has three equal phases:

- **Phase A (`t` 0 → ⅓):** Height grows from `minRectHeight` to the slide height. The centre moves along the bottom-left diagonal so the rotated box always touches the left and bottom viewport edges.
- **Phase B (`t` ⅓ → ⅔):** Height is fixed. The box slides across the viewport — left→right in landscape, down→up in portrait — straddling the opposite pair of edges.
- **Phase C (`t` ⅔ → 1):** Height shrinks back to `minRectHeight`. The centre moves along the top-right diagonal so the box always touches the top and right viewport edges.

All positions are computed analytically in [`src/geometry.ts`](src/geometry.ts) with no per-frame binary search.

### Trail canvas

A `<canvas>` sized once at mount (never resized) sits behind the box at `z-index: 49`. Keeping the canvas dimensions fixed ensures iOS browser-chrome resize events — which fire when the URL bar appears or disappears — never clear the pixel buffer.

When `trailFadeDelay` is `Infinity`, ghosts are drawn directly onto the canvas and it is never cleared. When a finite delay is set, rects are stored in memory with timestamps and a `requestAnimationFrame` loop redraws them with decreasing `globalAlpha`; the loop stops when all entries have faded. See [`src/trail.ts`](src/trail.ts).

### Text with Pretext

For each candidate prefix of segments the app calls **`prepare(text, font)`** once (result cached), then **`layout(prepared, innerWidth, lineHeight)`** to get the rendered height. A binary search over the segment array finds the maximum count that fits. This avoids `getBoundingClientRect` and layout thrash on every scroll tick.

### Build

TypeScript is bundled with **esbuild**; Tailwind v4 is compiled with **PostCSS**. `pnpm dev` runs a one-time build, then watches CSS and JS and serves `dist/` on port **5173**.

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

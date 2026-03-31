import { type Config } from "./config";
import { COS_M45, SIN_M45 } from "./constants";

// ── Basic math ────────────────────────────────────────────────────────────────

/** Linear interpolation between `a` and `b` at fraction `t` (0 = a, 1 = b). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Distance helpers ──────────────────────────────────────────────────────────

/**
 * Euclidean distance from screen point (cx, cy) to the viewport bottom-left
 * corner (0, H). Used to verify the symmetry invariant: the box starts the
 * same distance from VBL as it ends from VTR.
 */
export function distCenterToVbl(cx: number, cy: number, H: number): number {
  return Math.hypot(cx, cy - H);
}

/**
 * Euclidean distance from screen point (cx, cy) to the viewport top-right
 * corner (W, 0). Symmetric counterpart to `distCenterToVbl`.
 */
export function distCenterToVtr(cx: number, cy: number, W: number): number {
  return Math.hypot(cx - W, cy);
}

// ── CSS length parsing ────────────────────────────────────────────────────────

/**
 * Converts a CSS length string (px / em / rem) to pixels.
 * Only called for units that don't depend on the viewport size.
 */
export function parseCssLength(value: string, emPx: number, rootFontPx: number): number {
  const v = value.trim().toLowerCase();
  if (v.endsWith("em")) return Number.parseFloat(v) * emPx;
  if (v.endsWith("rem")) return Number.parseFloat(v) * rootFontPx;
  if (v.endsWith("px")) return Number.parseFloat(v);
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converts any CSS length string — including viewport-relative units
 * (vw, vh, vmin, vmax) — to pixels given the current viewport size.
 * Used to resolve `rectWidth` and `minRectHeight` from config each frame.
 */
export function parseLengthWithViewport(
  value: string,
  vw: number,
  vh: number,
  emPx: number,
  rootFontPx: number
): number {
  const v = value.trim().toLowerCase();
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  if (v.endsWith("vmin")) return (Math.min(vw, vh) * n) / 100;
  if (v.endsWith("vmax")) return (Math.max(vw, vh) * n) / 100;
  if (v.endsWith("vw")) return (vw * n) / 100;
  if (v.endsWith("vh")) return (vh * n) / 100;
  return parseCssLength(value, emPx, rootFontPx);
}

// ── Rotated-box geometry ──────────────────────────────────────────────────────

/**
 * Returns the four corners of an unrotated `w × h` box centered at (cx, cy)
 * after applying the animation's fixed −45° rotation. Used by `boundsRotated`
 * to compute the axis-aligned bounding box.
 */
export function rotatedCorners(
  cx: number,
  cy: number,
  w: number,
  h: number
): { x: number; y: number }[] {
  const dxs = [-w / 2, w / 2, w / 2, -w / 2];
  const dys = [-h / 2, -h / 2, h / 2, h / 2];
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const dx = dxs[i]!;
    const dy = dys[i]!;
    out.push({
      x: cx + dx * COS_M45 - dy * SIN_M45,
      y: cy + dx * SIN_M45 + dy * COS_M45,
    });
  }
  return out;
}

/**
 * Axis-aligned bounding box of the rotated box centered at (cx, cy) with
 * unrotated dimensions w × h. Used to check whether the box is inside the
 * viewport and to position the element without overflow.
 */
export function boundsRotated(
  cx: number,
  cy: number,
  w: number,
  h: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const pts = rotatedCorners(cx, cy, w, h);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Returns true when the bounding box `b` is fully inside the W × H viewport,
 * with `eps` pixels of tolerance for floating-point rounding.
 */
export function fitsViewport(
  b: { minX: number; maxX: number; minY: number; maxY: number },
  W: number,
  H: number,
  eps: number
): boolean {
  return (
    b.minX >= -eps &&
    b.maxX <= W + eps &&
    b.minY >= -eps &&
    b.maxY <= H + eps
  );
}

// ── Height floor ──────────────────────────────────────────────────────────────

/**
 * Minimum unrotated box height that can display exactly one line of text:
 * top padding + one line + bottom padding.
 * This is the height used at t=0 and t=1 (the corners of the animation).
 */
export function oneLineBoxHeightPx(cfg: Config): number {
  return cfg.paddingPx * 2 + cfg.lineHeightPx;
}

// ── Animation phases ──────────────────────────────────────────────────────────

/**
 * Core animation function. Given scroll progress `t` ∈ [0, 1], returns the
 * center position (cx, cy) and unrotated height `h` of the box in screen space.
 *
 * The animation has three equal phases:
 *
 * Phase A (t 0→⅓): h grows from hMin to hSlide while the box rides the
 *   bottom-left corner — right-top touches the left edge (VL), right-bottom
 *   touches the bottom edge (VB).
 *
 * Phase B (t ⅓→⅔): h is fixed at hSlide; the box slides across:
 *   - Landscape viewport: slides left→right, straddling top (VT) and bottom (VB).
 *   - Portrait viewport:  slides down→up, straddling left (VL) and right (VR).
 *
 * Phase C (t ⅔→1): h shrinks back from hSlide to hMin while the box rides the
 *   top-right corner — left-top touches the top edge (VT), left-bottom touches
 *   the right edge (VR).
 *
 * All transitions are analytic (closed-form), so no per-frame binary search
 * is needed.
 */
/**
 * Core animation function. Given scroll progress `t` ∈ [0, 1], returns the
 * center position (cx, cy) and unrotated height `h` of the box in screen space.
 *
 * All four directions (`cfg.direction`) are derived from the base `bl-to-tr`
 * geometry via two independent transformations applied before and after the
 * phase calculations:
 *
 *   - **flipT** (`tr-to-bl`, `br-to-tl`): inverts progress so the animation
 *     runs in reverse (`t → 1 − t`).
 *   - **flipY** (`tl-to-br`, `br-to-tl`): reflects the resulting center
 *     vertically (`cy → H − cy`), mapping the BL↔TR diagonal to TL↔BR.
 *
 * Base (`bl-to-tr`) phases:
 *
 * Phase A (t 0→⅓): h grows from hMin to hSlide while the center rides the
 *   bottom-left diagonal — bottom tip touches VB, left tip touches VL.
 *
 * Phase B (t ⅓→⅔): h is fixed at hSlide; the box slides across:
 *   - Landscape: slides left→right, straddling VT and VB.
 *   - Portrait:  slides down→up, straddling VL and VR.
 *
 * Phase C (t ⅔→1): h shrinks back from hSlide to hMin while the center rides
 *   the top-right diagonal — top tip touches VT, right tip touches VR.
 */
export function geometryForFrame(
  t: number,
  w: number,
  W: number,
  H: number,
  cfg: Config,
  minRectHeightPx: number
): { cx: number; cy: number; h: number } {
  const tt = Math.min(1, Math.max(0, t));

  if (w <= 1e-9) {
    return { cx: 0, cy: H, h: 0 };
  }

  const flipT = cfg.direction === 'tr-to-bl' || cfg.direction === 'br-to-tl';
  const flipY = cfg.direction === 'tl-to-br' || cfg.direction === 'br-to-tl';
  const tEff = flipT ? 1 - tt : tt;

  const hMin = Math.max(minRectHeightPx, oneLineBoxHeightPx(cfg));
  // hSlide: the height at which the box exactly spans the shorter viewport
  // dimension diagonally. (w + hSlide) / (2√2) = D/2 when hSlide = D√2 − w.
  const D = Math.min(W, H);
  const hSlide = Math.max(hMin, D * Math.SQRT2 - w);
  // half: the offset from center to each edge-touching corner along the diagonal.
  const half = (w + hSlide) / (2 * Math.SQRT2);

  const phaseFrac = 1 / 3;

  let cx: number, cy: number, h: number;

  if (tEff < phaseFrac) {
    // Phase A: grow h; center moves along the VBL diagonal.
    const p = tEff / phaseFrac;
    h = lerp(hMin, hSlide, p);
    const k = (w + h) / (2 * Math.SQRT2);
    cx = k; cy = H - k;
  } else if (tEff < 2 * phaseFrac) {
    // Phase B: slide at fixed height.
    const p = (tEff - phaseFrac) / phaseFrac;
    h = hSlide;
    if (W >= H) {
      // Landscape: cx slides left→right, cy stays at H − half (straddles VB/VT).
      cx = lerp(half, W - half, p); cy = H - half;
    } else {
      // Portrait: cy slides down→up, cx stays at half (straddles VL/VR).
      cx = half; cy = lerp(H - half, half, p);
    }
  } else {
    // Phase C: shrink h; center moves along the VTR diagonal.
    const p = (tEff - 2 * phaseFrac) / phaseFrac;
    h = lerp(hSlide, hMin, p);
    const k = (w + h) / (2 * Math.SQRT2);
    cx = W - k; cy = k;
  }

  return { cx, cy: flipY ? H - cy : cy, h };
}

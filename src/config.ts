/**
 * Single source of truth for every tunable value in the animation.
 * Changing a value here propagates to geometry, scroll range, and text layout
 * without touching any other file.
 */
export const animationConfig = {
  /**
   * The copy shown inside the box, split into logical segments.
   * Each scroll phase reveals one more segment; Pretext fits as many as
   * physically possible given the current box height.
   */
  script: [
    "Scroll drives the shape.",
    "Fixed width: height is one line of text at the ends and grows through the middle of the scroll.",
    "Pretext measures lines without DOM thrash, so we only paint what fits.",
    "Width stays constant; height follows the edge-riding phases in user space (VBL origin, VTR opposite).",
    "End at the same distance from VTR as you started from VBL.",
  ],
  /**
   * Fixed CSS width of the unrotated box (height is solved each frame).
   * Supports px, em, rem, vw, vh, vmin, vmax.
   * Example: `"10vmin"` is 10% of the smaller viewport dimension.
   */
  rectWidth: "10vmin",
  /**
   * Minimum CSS height of the unrotated box (geometry floor).
   * Same length syntax as `rectWidth`.
   * Initial placement at VBL uses this as the hypotenuse of the 45°/45°/90°
   * corner triangle (see spec).
   */
  minRectHeight: "10vmin",
  /**
   * Scales the upper bound used when binary-searching local height `h`.
   * The bound is derived from fitting the rotated AABB `(w+h)/√2` in the
   * viewport — not `min(vw,vh)`.
   */
  maxHeightFraction: 1,
  /** Scroll distance (px) per 1% of normalized scroll progress. Controls total page height. */
  scrollPixelsPerPercent: 12,
  /** Multiplier on the total scroll length derived from scrollPixelsPerPercent. */
  scrollHeightMultiplier: 1,
  /** Inner padding of the rectangle (px). Subtracted from both dimensions before text layout. */
  paddingPx: 12,
  /** Line height in px. Keep in sync with the `leading-[22px]` Tailwind class on `.square-text`. */
  lineHeightPx: 22,
  /** Font shorthand passed to Pretext for line-break measurement. Must match `.square-text` in CSS. */
  pretextFont: '400 15px "Inter", ui-sans-serif, sans-serif',
  /**
   * When true, or when the URL has `?debug=1`, shows a debug overlay and
   * exposes `window.__ridingEdgesDebug`. Set to false (and remove the
   * debug import in main.ts) to ship without any debug code.
   */
  debug: false,
} as const;

export type Config = typeof animationConfig;

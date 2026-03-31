/**
 * Single source of truth for every tunable value in the animation.
 * Changing a value here propagates to geometry, scroll range, and text layout
 * without touching any other file.
 */
export const animationConfig: {
  /**
   * The copy shown inside the box.
   *
   * - `string[]` — each element is one segment; scroll reveals them one at a time.
   * - `string` — split on whitespace; each word becomes its own segment.
   */
  script: string | readonly string[];
  rectWidth: string;
  minRectHeight: string;
  maxHeightFraction: number;
  scrollPixelsPerPercent: number;
  scrollHeightMultiplier: number;
  /**
   * CSS `background` value for the box interior. Supports solid colors,
   * `rgba()`, gradients — anything the `background` property accepts.
   */
  rectBackground: string;
  /**
   * CSS color of the box border.
   */
  rectBorderColor: string;
  /**
   * Width of the box border as a CSS length, e.g. `"1px"` or `"2px"`.
   */
  rectBorderWidth: string;
  /**
   * Color of the text inside the box. Any CSS color value.
   */
  rectTextColor: string;
  paddingPx: number;
  lineHeightPx: number;
  pretextFont: string;
  /**
   * When true, paints a ghost rectangle on the trail canvas at each position
   * the box visits. When false the canvas is never drawn to.
   */
  trailEnabled: boolean;
  /**
   * Color(s) used for trail rectangles.
   *
   * - `string` — every ghost is this color.
   * - `string[]` — cycles through the array in order as the box moves.
   */
  trailColor: string | readonly string[];
  /**
   * How long (ms) a trail ghost stays at full opacity before fading begins.
   * Set to `Infinity` (the default) to never fade — ghosts accumulate forever.
   */
  trailFadeDelay: number;
  /**
   * Duration (ms) of the fade-out once the delay has elapsed.
   * A value of `0` causes an instant disappearance after the delay.
   * Ignored when `trailFadeDelay` is `Infinity`.
   */
  trailFadeDuration: number;
  debug: boolean;
} = {
  script: `Sed posuere consectetur est at lobortis. Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed posuere consectetur est at lobortis. Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor.

Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Nulla vitae elit libero, a pharetra augue. Maecenas faucibus mollis interdum. Etiam porta sem malesuada magna mollis euismod.`,
  // script: [
  //   "Scroll drives the shape.",
  //   "Fixed width: height is one line of text at the ends and grows through the middle of the scroll.",
  //   "Pretext measures lines without DOM thrash, so we only paint what fits.",
  //   "Width stays constant; height follows the edge-riding phases in user space (VBL origin, VTR opposite).",
  //   "End at the same distance from VTR as you started from VBL.",
  // ],
  /**
   * Fixed CSS width of the unrotated box (height is solved each frame).
   * Supports px, em, rem, vw, vh, vmin, vmax.
   * Example: `"10vmin"` is 10% of the smaller viewport dimension.
   */
  rectWidth: "30vmin",
  /**
   * Minimum CSS height of the unrotated box (geometry floor).
   * Same length syntax as `rectWidth`.
   * Initial placement at VBL uses this as the hypotenuse of the 45°/45°/90°
   * corner triangle (see spec).
   */
  minRectHeight: "30vmin",
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
  /** Box background — any CSS `background` value, including gradients. */
  rectBackground: "rgb(0 0 0 / 95%)",
  /** Box border color. */
  rectBorderColor: "rgb(113 113 122 / 80%)",
  /** Box border width. */
  rectBorderWidth: "1px",
  /** Text color inside the box. */
  rectTextColor: "#f4f4f5",
  /** Inner padding of the rectangle (px). Subtracted from both dimensions before text layout. */
  paddingPx: 12,
  /** Line height in px. Keep in sync with the `leading-[22px]` Tailwind class on `.square-text`. */
  lineHeightPx: 22,
  /** Font shorthand passed to Pretext for line-break measurement. Must match `.square-text` in CSS. */
  pretextFont: '400 15px "Inter", ui-sans-serif, sans-serif',
  /** Set to false to disable the trail entirely without removing the feature. */
  trailEnabled: true,
  // trailColor: "red",
  /** Single color string or array to cycle through. Any CSS color value is valid. */
  trailColor: ["#000000","#ffffff"],
  /** How long (ms) each ghost stays fully opaque. `Infinity` = never fades. */
  trailFadeDelay: 0,
  /** Duration (ms) of the fade after the delay. `0` = instant disappearance. */
  trailFadeDuration: 100,
  /**
   * When true, or when the URL has `?debug=1`, shows a debug overlay and
   * exposes `window.__ridingEdgesDebug`. Set to false (and remove the
   * debug import in main.ts) to ship without any debug code.
   */
  debug: false,
};

export type Config = typeof animationConfig;

/**
 * Resolves `config.script` to a normalized `readonly string[]`.
 * When `script` is a plain string it is split on runs of whitespace;
 * when it is already an array it is returned as-is.
 */
export function resolveScript(script: string | readonly string[]): readonly string[] {
  if (typeof script === "string") {
    return script.split(/\s+/).filter(Boolean);
  }
  return script;
}

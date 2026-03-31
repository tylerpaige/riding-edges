/**
 * Text layout helpers — wrapping Pretext so the animation loop can ask
 * "how many script segments fit in this box right now?" without touching the DOM.
 */
import { prepare, layout } from "@chenglou/pretext";

/**
 * Pretext's `prepare()` is pure and deterministic for a given (text, font) pair,
 * so we cache the result to avoid re-parsing on every animation frame.
 */
const preparedCache = new Map<string, ReturnType<typeof prepare>>();

/**
 * Returns a Pretext-prepared representation of `text` rendered in `font`,
 * computing it once and serving from cache on subsequent calls.
 */
function getPrepared(text: string, font: string) {
  const key = `${font}\0${text}`;
  let p = preparedCache.get(key);
  if (!p) {
    p = prepare(text, font);
    preparedCache.set(key, p);
  }
  return p;
}

/**
 * Concatenates the first `count` segments into the single string that will be
 * set as `textContent`. Returns an empty string when count ≤ 0 so callers
 * don't need to guard against that case.
 */
export function joinSegments(segments: readonly string[], count: number): string {
  if (count <= 0) return "";
  return segments.slice(0, count).join(" ");
}

/**
 * Binary-searches for the largest prefix of `segments` whose joined text fits
 * inside a box of `innerW × innerH` px when laid out with Pretext.
 *
 * Why binary search? Segment count is a monotone constraint: if N segments fit,
 * N-1 also fit. So we can halve the search space each step instead of testing
 * every count linearly.
 *
 * `desiredMax` caps the search at the number of segments the scroll position
 * has "unlocked", preventing future segments from appearing ahead of time.
 */
export function maxFittingSegmentCount(
  segments: readonly string[],
  innerW: number,
  innerH: number,
  font: string,
  lineHeight: number,
  desiredMax: number
): number {
  if (innerW <= 0 || innerH <= 0) return 0;
  let lo = 0;
  let hi = Math.min(desiredMax, segments.length);
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const text = joinSegments(segments, mid);
    if (!text.length) {
      lo = mid + 1;
      continue;
    }
    const prepared = getPrepared(text, font);
    const { height } = layout(prepared, innerW, lineHeight);
    if (height <= innerH + 0.5) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

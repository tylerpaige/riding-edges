import { type Config } from "./config";

type TrailRect = {
  cx: number;
  cy: number;
  w: number;
  h: number;
  color: string;
  drawnAt: number;
};

/**
 * Creates a fixed, full-viewport canvas behind the animated box and returns a
 * `stamp` function that `applyFrame` calls each tick to paint a ghost rectangle
 * at the box's current position.
 *
 * Two rendering paths are used depending on `cfg.trailFadeDelay`:
 *
 * - **`Infinity` (never fades):** each ghost is drawn directly onto the canvas
 *   and the canvas is never cleared. This avoids a `requestAnimationFrame` loop
 *   and also means the trail survives iOS browser-chrome resize events, which
 *   would otherwise clear a canvas that gets resized.
 *
 * - **Finite delay:** ghosts are stored in a list with timestamps and a `rAF`
 *   loop redraws them each frame with decreasing `globalAlpha` once their age
 *   exceeds `trailFadeDelay`. Fully transparent entries are dropped from the
 *   list and the loop stops when the list is empty.
 *
 * In either path the canvas pixel dimensions are fixed at mount time so that
 * iOS resize events (triggered when the browser chrome appears or disappears)
 * never cause the buffer to be reallocated or cleared.
 */
export function mountTrail(
  root: HTMLElement,
  cfg: Pick<Config, "trailEnabled" | "trailColor" | "trailFadeDelay" | "trailFadeDuration">
): (cx: number, cy: number, w: number, h: number) => void {
  if (!cfg.trailEnabled) return () => {};

  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:49;pointer-events:none;";
  // Fix pixel dimensions once — never change them to avoid clearing the buffer.
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  root.appendChild(canvas);

  const ctx = canvas.getContext("2d")!;
  const colors = Array.isArray(cfg.trailColor) ? cfg.trailColor : [cfg.trailColor];
  let colorIndex = 0;

  if (cfg.trailFadeDelay === Infinity) {
    // ── Never-fading path ───────────────────────────────────────────────────
    // Draw directly; no rAF loop needed, canvas is never cleared.
    return (cx, cy, w, h) => {
      const color = colors[colorIndex % colors.length] as string;
      colorIndex++;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = color;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    };
  }

  // ── Fading path ─────────────────────────────────────────────────────────
  // Ghosts are stored with their timestamp; a rAF loop redraws with alpha.
  const rects: TrailRect[] = [];
  let rafId: number | null = null;

  const render = () => {
    const now = performance.now();
    const { trailFadeDelay, trailFadeDuration } = cfg;

    // Drop entries that have fully faded.
    const cutoff = now - trailFadeDelay - trailFadeDuration;
    while (rects.length > 0 && rects[0]!.drawnAt < cutoff) {
      rects.shift();
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const r of rects) {
      const age = now - r.drawnAt;
      const alpha =
        age <= trailFadeDelay
          ? 1
          : trailFadeDuration > 0
            ? 1 - (age - trailFadeDelay) / trailFadeDuration
            : 0;
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(r.cx, r.cy);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = r.color;
      ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }

    rafId = rects.length > 0 ? requestAnimationFrame(render) : null;
  };

  return (cx, cy, w, h) => {
    const color = colors[colorIndex % colors.length] as string;
    colorIndex++;
    rects.push({ cx, cy, w, h, color, drawnAt: performance.now() });
    if (rafId === null) {
      rafId = requestAnimationFrame(render);
    }
  };
}

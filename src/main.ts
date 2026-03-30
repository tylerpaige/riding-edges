import { prepare, layout } from "@chenglou/pretext";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Tunable in one place — animation + copy + scroll range */
export const animationConfig = {
  /** Logical segments; more lines appear as the box gains height. */
  script: [
    "Scroll drives the shape.",
    "Fixed width: height is one line of text at the ends and grows through the middle of the scroll.",
    "Pretext measures lines without DOM thrash, so we only paint what fits.",
    "Width stays constant; height is chosen so the rotated box keeps contact with the frame.",
    "End opposite where you started, still riding the edges.",
  ],
  /**
   * Fixed CSS width of the unrotated box (height is solved each frame). Supports px, em, rem, vw, vh, vmin, vmax.
   * Example: `"10vmin"` is 10% of the smaller viewport dimension.
   */
  rectWidth: "10vmin",
  /** Upper bound on solved height: fraction of min(viewport width, height). */
  maxHeightFraction: 0.99,
  /** Treat a corner as on an edge within this many pixels. */
  edgeSnapPx: 2.5,
  /** Scroll distance (px) that corresponds to a 1% change in normalized scroll progress (see body height). */
  scrollPixelsPerPercent: 12,
  /** Multiplier on total scroll length derived from scrollPixelsPerPercent. */
  scrollHeightMultiplier: 1,
  /** Padding inside the rectangle (px). */
  paddingPx: 12,
  /** Line height in px (keep in sync with CSS). */
  lineHeightPx: 22,
  /** Font shorthand passed to Pretext — must match `.square-text` in CSS. */
  pretextFont: '400 15px "Inter", ui-sans-serif, sans-serif',
} as const;

type Config = typeof animationConfig;

const preparedCache = new Map<string, ReturnType<typeof prepare>>();

function getPrepared(text: string, font: string) {
  const key = `${font}\0${text}`;
  let p = preparedCache.get(key);
  if (!p) {
    p = prepare(text, font);
    preparedCache.set(key, p);
  }
  return p;
}

function parseCssLength(value: string, emPx: number, rootFontPx: number): number {
  const v = value.trim().toLowerCase();
  if (v.endsWith("em")) {
    return Number.parseFloat(v) * emPx;
  }
  if (v.endsWith("rem")) {
    return Number.parseFloat(v) * rootFontPx;
  }
  if (v.endsWith("px")) {
    return Number.parseFloat(v);
  }
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/** Resolves vw, vh, vmin, vmax, plus em/rem/px (same as parseCssLength). */
function parseLengthWithViewport(
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

function joinSegments(segments: readonly string[], count: number): string {
  if (count <= 0) return "";
  return segments.slice(0, count).join(" ");
}

function maxFittingSegmentCount(
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

/** CSS `rotate(-45deg)`: x' = x cos θ - y sin θ, y' = x sin θ + y cos θ, θ = -π/4 */
const COS_M45 = Math.cos(-Math.PI / 4);
const SIN_M45 = Math.sin(-Math.PI / 4);

function rotatedCorners(
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

function boundsRotated(
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

function fitsViewport(
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

function cornersOnViewportEdges(
  pts: readonly { x: number; y: number }[],
  W: number,
  H: number,
  eps: number
): number {
  let n = 0;
  for (const p of pts) {
    if (
      p.x <= eps ||
      p.x >= W - eps ||
      p.y <= eps ||
      p.y >= H - eps
    ) {
      n++;
    }
  }
  return n;
}

/** Unrotated box height for exactly one line: top/bottom padding plus one line at lineHeightPx. */
function oneLineBoxHeightPx(cfg: Config): number {
  return cfg.paddingPx * 2 + cfg.lineHeightPx;
}

function centerAndBoundsForT(
  t: number,
  w: number,
  height: number,
  W: number,
  H: number
): { cx: number; cy: number; b: ReturnType<typeof boundsRotated> } {
  const L = (w + height) / Math.SQRT2;
  const tt = Math.min(1, Math.max(0, t));
  const cx = (W - L) * tt + L / 2;
  const cy = H - (H - L) * tt - L / 2;
  const b = boundsRotated(cx, cy, w, height);
  return { cx, cy, b };
}

/**
 * Largest height (≤ cap) for which the -45° rect fits and at least two corners lie on viewport edges.
 */
function maxHeightFlushFeasible(
  t: number,
  w: number,
  W: number,
  H: number,
  cfg: Config
): number {
  const tt = Math.min(1, Math.max(0, t));
  const edgeEps = cfg.edgeSnapPx;
  const hCap = cfg.maxHeightFraction * Math.min(W, H);
  const hSearchMax = Math.min(2 * (W + H), hCap);

  const feasibleWithFlush = (height: number): boolean => {
    if (height < 1e-9) return false;
    const { cx, cy, b } = centerAndBoundsForT(tt, w, height, W, H);
    if (!fitsViewport(b, W, H, 0.25)) return false;
    const pts = rotatedCorners(cx, cy, w, height);
    return cornersOnViewportEdges(pts, W, H, edgeEps) >= 2;
  };

  const steps = 100;
  let best = 0;
  for (let i = 0; i <= steps; i++) {
    const hTry = (i / steps) * hSearchMax;
    if (feasibleWithFlush(hTry)) best = hTry;
  }

  if (best > 0) {
    const step = hSearchMax / steps;
    const hi = Math.min(best + step, hSearchMax);
    if (feasibleWithFlush(hi)) {
      let lo = best;
      let hiB = hi;
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hiB) / 2;
        if (feasibleWithFlush(mid)) lo = mid;
        else hiB = mid;
      }
      best = lo;
    }
  }

  return best;
}

/** Largest height that fits in the viewport (flush ignored). */
function maxHeightFitOnly(
  t: number,
  w: number,
  W: number,
  H: number,
  cfg: Config
): number {
  const tt = Math.min(1, Math.max(0, t));
  const hCap = cfg.maxHeightFraction * Math.min(W, H);
  const hSearchMax = Math.min(2 * (W + H), hCap);

  const centerAndBounds = (height: number) =>
    centerAndBoundsForT(tt, w, height, W, H);

  let lo = 0;
  let hi = hSearchMax;
  for (let k = 0; k < 38; k++) {
    const mid = (lo + hi) / 2;
    const { b } = centerAndBounds(mid);
    if (fitsViewport(b, W, H, 0.25)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Fixed width `w`, rotated -45°. Height is **one line** at t∈{0,1}, then grows toward mid-scroll
 * (sin curve) up to the largest flush-feasible height for that `t`. Center follows the diagonal
 * between bottom-left and top-right so start/end sit in the corners when `h` is small.
 */
function geometryForFrame(
  t: number,
  w: number,
  W: number,
  H: number,
  cfg: Config
): { cx: number; cy: number; h: number } {
  const tt = Math.min(1, Math.max(0, t));

  if (w <= 1e-9) {
    return { cx: 0, cy: H, h: 0 };
  }

  const hMin = oneLineBoxHeightPx(cfg);
  let hPeak = maxHeightFlushFeasible(tt, w, W, H, cfg);
  if (hPeak < hMin) {
    hPeak = Math.max(maxHeightFitOnly(tt, w, W, H, cfg), hMin);
  } else {
    hPeak = Math.max(hPeak, hMin);
  }

  const rise = Math.sin(Math.PI * tt);
  const h = hMin + (hPeak - hMin) * rise;

  const { cx, cy } = centerAndBoundsForT(tt, w, h, W, H);
  return { cx, cy, h };
}

function mount() {
  const root = document.getElementById("app");
  if (!root) throw new Error("#app missing");

  const rect = document.createElement("div");
  rect.className =
    "square fixed z-50 box-border overflow-hidden border border-zinc-500/80 bg-zinc-900/95 shadow-2xl shadow-black/40";
  rect.style.left = "0";
  rect.style.top = "0";
  rect.style.width = "1em";
  rect.style.height = "1em";
  rect.style.fontSize = "16px";
  rect.style.transformOrigin = "50% 50%";
  rect.style.transform = "rotate(-45deg)";

  const textEl = document.createElement("p");
  textEl.className =
    "square-text m-0 h-full w-full break-words p-0 text-left text-[15px] font-normal leading-[22px] tracking-tight text-zinc-100";
  textEl.style.fontFamily = 'Inter, ui-sans-serif, sans-serif';
  rect.appendChild(textEl);
  root.appendChild(rect);

  const emPx = 16;
  const rootFontPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  const cfg = animationConfig;
  const scrollRangePx =
    100 * cfg.scrollPixelsPerPercent * cfg.scrollHeightMultiplier;
  document.documentElement.style.setProperty(
    "--scroll-doc-height",
    `calc(100vh + ${scrollRangePx}px)`
  );

  let widthPx = parseLengthWithViewport(
    cfg.rectWidth,
    window.innerWidth,
    window.innerHeight,
    emPx,
    rootFontPx
  );

  const updateMetrics = () => {
    widthPx = parseLengthWithViewport(
      cfg.rectWidth,
      window.innerWidth,
      window.innerHeight,
      emPx,
      rootFontPx
    );
  };

  const applyFrame = (t: number) => {
    const tt = Math.min(1, Math.max(0, t));
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { cx, cy, h } = geometryForFrame(tt, widthPx, vw, vh, cfg);
    const w = widthPx;

    rect.style.left = `${cx - w / 2}px`;
    rect.style.top = `${cy - h / 2}px`;
    rect.style.right = "auto";
    rect.style.bottom = "auto";
    rect.style.width = `${w}px`;
    rect.style.height = `${h}px`;

    const pad = cfg.paddingPx;
    const innerW = Math.max(0, w - pad * 2);
    const innerH = Math.max(0, h - pad * 2);
    textEl.style.padding = `${pad}px`;

    const desiredCount = Math.min(
      cfg.script.length,
      Math.ceil(tt * cfg.script.length - 1e-9)
    );
    const fitCount = maxFittingSegmentCount(
      cfg.script,
      innerW,
      innerH,
      cfg.pretextFont,
      cfg.lineHeightPx,
      desiredCount
    );
    textEl.textContent = joinSegments(cfg.script, fitCount);
  };

  const st = ScrollTrigger.create({
    id: "main-scroll",
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      applyFrame(self.progress);
    },
  });

  applyFrame(st.progress);

  window.addEventListener(
    "resize",
    () => {
      updateMetrics();
      ScrollTrigger.refresh();
      applyFrame(st.progress);
    },
    { passive: true }
  );

  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      ScrollTrigger.refresh();
      applyFrame(st.progress);
    });
  }
}

mount();

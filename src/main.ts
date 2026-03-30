import { prepare, layout } from "@chenglou/pretext";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** CSS `rotate(-45deg)` — shared by layout math and DOM */
const COS_M45 = Math.cos(-Math.PI / 4);
const SIN_M45 = Math.sin(-Math.PI / 4);

/** Tunable in one place — animation + copy + scroll range */
export const animationConfig = {
  /** Logical segments; more lines appear as the box gains height. */
  script: [
    "Scroll drives the shape.",
    "Fixed width: height is one line of text at the ends and grows through the middle of the scroll.",
    "Pretext measures lines without DOM thrash, so we only paint what fits.",
    "Width stays constant; height follows the edge-riding phases in user space (VBL origin, VTR opposite).",
    "End at the same distance from VTR as you started from VBL.",
  ],
  /**
   * Fixed CSS width of the unrotated box (height is solved each frame). Supports px, em, rem, vw, vh, vmin, vmax.
   * Example: `"10vmin"` is 10% of the smaller viewport dimension.
   */
  rectWidth: "10vmin",
  /**
   * Minimum CSS height of the unrotated box (geometry floor). Same length syntax as `rectWidth`.
   * Initial placement at VBL uses this as the hypotenuse of the 45°/45°/90° corner triangle (see spec).
   */
  minRectHeight: "10vmin",
  /** Upper bound on solved height: fraction of min(viewport width, height). */
  maxHeightFraction: 1,
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
  /**
   * When true, or when the page URL has `?debug=1`, shows a debug overlay and enables
   * `window.__ridingEdgesDebug` (last snapshot + `copyDebugJson()`).
   */
  debug: false,
} as const;

type Config = typeof animationConfig;

function isDebugEnabled(cfg: Config): boolean {
  if (typeof window === "undefined") return false;
  if (cfg.debug) return true;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

function hCapPx(cfg: Config, W: number, H: number): number {
  return cfg.maxHeightFraction * Math.min(W, H);
}

/** RTL on VL (x=0) and RBL on VB (y=H); see spec (45°/45°/90° corner with hypotenuse = h). */
function centerFromRtlVlRblVb(w: number, h: number, W: number, H: number): { cx: number; cy: number } {
  const cx = (w * COS_M45) / 2 - (h * SIN_M45) / 2;
  const cy = H + (w * SIN_M45) / 2 - (h * COS_M45) / 2;
  return { cx, cy };
}

/** RBL constrained to bottom edge: (xb, H). BL local (-w/2, h/2). */
function centerFromRblOnVB(xb: number, w: number, h: number, H: number): { cx: number; cy: number } {
  const cx = xb + (w * COS_M45) / 2 + (h * SIN_M45) / 2;
  const cy = H + (w * SIN_M45) / 2 - (h * COS_M45) / 2;
  return { cx, cy };
}

/** RTR constrained to top edge (VT): sy = 0. TR local (w/2, -h/2). */
function centerFromRtrOnVT(sxTr: number, w: number, h: number): { cx: number; cy: number } {
  const cy = (-w * SIN_M45) / 2 + (h * COS_M45) / 2;
  const cx = sxTr - (w * COS_M45) / 2 - (h * SIN_M45) / 2;
  return { cx, cy };
}

/** RTL constrained to left edge (VL): sx = 0. TL local (-w/2, -h/2). */
function centerFromRtlOnVL(syTl: number, w: number, h: number): { cx: number; cy: number } {
  const cx = (w * COS_M45) / 2 - (h * SIN_M45) / 2;
  const cy = syTl + (w * SIN_M45) / 2 + (h * COS_M45) / 2;
  return { cx, cy };
}

/** RBR constrained to top edge (VT): sy = 0. BR local (w/2, h/2). */
function centerFromRbrOnVT(sxBr: number, w: number, h: number): { cx: number; cy: number } {
  const cy = (-w * SIN_M45) / 2 - (h * COS_M45) / 2;
  const cx = sxBr - (w * COS_M45) / 2 + (h * SIN_M45) / 2;
  return { cx, cy };
}

function maxHeightBinarySearch(
  hMin: number,
  hMax: number,
  fits: (h: number) => boolean
): number {
  if (hMax < hMin - 1e-9) return hMin;
  if (!fits(hMin)) return hMin;
  let lo = hMin;
  let hi = hMax;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function maxHeightRblOnVB(
  xb: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): number {
  return maxHeightBinarySearch(hMin, hMax, (hh) => {
    const { cx, cy } = centerFromRblOnVB(xb, w, hh, H);
    return fitsViewport(boundsRotated(cx, cy, w, hh), W, H, 0.25);
  });
}

function maxHeightRtrOnVT(
  sxTr: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): number {
  return maxHeightBinarySearch(hMin, hMax, (hh) => {
    const { cx, cy } = centerFromRtrOnVT(sxTr, w, hh);
    return fitsViewport(boundsRotated(cx, cy, w, hh), W, H, 0.25);
  });
}

function maxHeightRtlOnVL(
  syTl: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): number {
  return maxHeightBinarySearch(hMin, hMax, (hh) => {
    const { cx, cy } = centerFromRtlOnVL(syTl, w, hh);
    return fitsViewport(boundsRotated(cx, cy, w, hh), W, H, 0.25);
  });
}

function maxHeightRbrOnVT(
  sxBr: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): number {
  return maxHeightBinarySearch(hMin, hMax, (hh) => {
    const { cx, cy } = centerFromRbrOnVT(sxBr, w, hh);
    return fitsViewport(boundsRotated(cx, cy, w, hh), W, H, 0.25);
  });
}

function distCenterToVbl(cx: number, cy: number, H: number): number {
  return Math.hypot(cx - 0, cy - H);
}

function distCenterToVtr(cx: number, cy: number, W: number): number {
  return Math.hypot(cx - W, cy - 0);
}

/**
 * Find u ∈ [0,100] (normalized x on VT) so that with RTR on VT and max height,
 * distance(center, VTR) is closest to targetDist (distance from start center to VBL).
 */
function solveUtrForSymmetricEnd(
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number,
  targetDist: number
): { u: number; cx: number; cy: number; h: number } | null {
  let best: { u: number; cx: number; cy: number; h: number; err: number } | null = null;
  for (let s = 0; s <= 100; s += 0.05) {
    const sxTr = (s / 100) * W;
    const hh = maxHeightRtrOnVT(sxTr, w, W, H, hMin, hMax);
    const { cx, cy } = centerFromRtrOnVT(sxTr, w, hh);
    const err = Math.abs(distCenterToVtr(cx, cy, W) - targetDist);
    if (!best || err < best.err) best = { u: s, cx, cy, h: hh, err };
  }
  return best;
}

function solveUbrForSymmetricEnd(
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number,
  targetDist: number
): { u: number; cx: number; cy: number; h: number } | null {
  let best: { u: number; cx: number; cy: number; h: number; err: number } | null = null;
  for (let s = 0; s <= 100; s += 0.05) {
    const sxBr = (s / 100) * W;
    const hh = maxHeightRbrOnVT(sxBr, w, W, H, hMin, hMax);
    const { cx, cy } = centerFromRbrOnVT(sxBr, w, hh);
    const err = Math.abs(distCenterToVtr(cx, cy, W) - targetDist);
    if (!best || err < best.err) best = { u: s, cx, cy, h: hh, err };
  }
  return best;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function geometryWidthMajor(
  tt: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): { cx: number; cy: number; h: number } {
  const { cx: cx0, cy: cy0 } = centerFromRtlVlRblVb(w, hMin, W, H);
  const d0 = distCenterToVbl(cx0, cy0, H);
  const xBl0 =
    cx0 + (-w / 2) * COS_M45 - (hMin / 2) * SIN_M45;
  const uBl0 = (100 * xBl0) / W;
  const uDelta = 50 - uBl0;
  const end = solveUtrForSymmetricEnd(w, W, H, hMin, hMax, d0);

  const uBl1 = 50;
  const sxTrPhase1End = (() => {
    const xb = (uBl1 / 100) * W;
    const h1 = maxHeightRblOnVB(xb, w, W, H, hMin, hMax);
    const { cx, cy } = centerFromRblOnVB(xb, w, h1, H);
    const sxTr =
      cx + (w / 2) * COS_M45 - (-h1 / 2) * SIN_M45;
    return sxTr;
  })();
  const uTr1 = (100 * sxTrPhase1End) / W;

  if (!end) {
    const { cx, cy } = centerFromRtlVlRblVb(w, hMin, W, H);
    return { cx, cy, h: hMin };
  }

  const uTrEnd = end.u;
  const phaseFrac = 1 / 3;
  if (tt < phaseFrac) {
    const p = tt / phaseFrac;
    const uBl = lerp(uBl0, uBl1, p);
    const xb = (uBl / 100) * W;
    const h = maxHeightRblOnVB(xb, w, W, H, hMin, hMax);
    return { ...centerFromRblOnVB(xb, w, h, H), h };
  }
  if (tt < 2 * phaseFrac) {
    const p = (tt - phaseFrac) / phaseFrac;
    const uTr = lerp(uTr1, uTr1 + uDelta, p);
    const sxTr = (uTr / 100) * W;
    const h = maxHeightRtrOnVT(sxTr, w, W, H, hMin, hMax);
    return { ...centerFromRtrOnVT(sxTr, w, h), h };
  }
  const p = (tt - 2 * phaseFrac) / phaseFrac;
  const uTr = lerp(uTr1 + uDelta, uTrEnd, p);
  const sxTr = (uTr / 100) * W;
  const h = maxHeightRtrOnVT(sxTr, w, W, H, hMin, hMax);
  return { ...centerFromRtrOnVT(sxTr, w, h), h };
}

function geometryHeightMajor(
  tt: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): { cx: number; cy: number; h: number } {
  const { cx: cx0, cy: cy0 } = centerFromRtlVlRblVb(w, hMin, W, H);
  const d0 = distCenterToVbl(cx0, cy0, H);
  const syTl0 =
    cy0 + (-w / 2) * SIN_M45 + (-hMin / 2) * COS_M45;
  const vRtl0 = (100 * (H - syTl0)) / H;
  const vDelta = 50 - vRtl0;
  const end = solveUbrForSymmetricEnd(w, W, H, hMin, hMax, d0);

  const vRtl1 = 50;
  const syTl1 = H * (1 - vRtl1 / 100);
  const sxBrPhase1End = (() => {
    const h1 = maxHeightRtlOnVL(syTl1, w, W, H, hMin, hMax);
    const { cx, cy } = centerFromRtlOnVL(syTl1, w, h1);
    const sxBr =
      cx + (w / 2) * COS_M45 - (h1 / 2) * SIN_M45;
    return sxBr;
  })();
  const uBr1 = (100 * sxBrPhase1End) / W;

  if (!end) {
    const { cx, cy } = centerFromRtlVlRblVb(w, hMin, W, H);
    return { cx, cy, h: hMin };
  }

  const uBrEnd = end.u;
  const phaseFrac = 1 / 3;
  if (tt < phaseFrac) {
    const p = tt / phaseFrac;
    const vRtl = lerp(vRtl0, vRtl1, p);
    const syTl = H * (1 - vRtl / 100);
    const h = maxHeightRtlOnVL(syTl, w, W, H, hMin, hMax);
    return { ...centerFromRtlOnVL(syTl, w, h), h };
  }
  if (tt < 2 * phaseFrac) {
    const p = (tt - phaseFrac) / phaseFrac;
    const uBr = lerp(uBr1, uBr1 + vDelta, p);
    const sxBr = (uBr / 100) * W;
    const h = maxHeightRbrOnVT(sxBr, w, W, H, hMin, hMax);
    return { ...centerFromRbrOnVT(sxBr, w, h), h };
  }
  const p = (tt - 2 * phaseFrac) / phaseFrac;
  const uBr = lerp(uBr1 + vDelta, uBrEnd, p);
  const sxBr = (uBr / 100) * W;
  const h = maxHeightRbrOnVT(sxBr, w, W, H, hMin, hMax);
  return { ...centerFromRbrOnVT(sxBr, w, h), h };
}

export type GeometryDebugSnapshot = {
  /** Scroll progress 0..1 */
  t: number;
  viewport: { W: number; H: number };
  /** Unrotated width (px) */
  w: number;
  /** Major axis: width vs height */
  widthMajor: boolean;
  /** Distance center → VBL at start (px) */
  distCenterToVblStart: number;
  /** Distance center → VTR at current frame (px) */
  distCenterToVtr: number;
  hMin: number;
  hCap: number;
  /** Whether rotated bounds fit the viewport after all clamps */
  fitsViewportFinal: boolean;
  hFinal: number;
  L: number;
  centerScreen: { cx: number; cy: number };
  boundsScreen: { minX: number; maxX: number; minY: number; maxY: number };
  notes: string[];
};

function buildGeometryDebugSnapshot(
  tt: number,
  w: number,
  W: number,
  H: number,
  cfg: Config,
  minRectHeightPx: number
): GeometryDebugSnapshot {
  const t = Math.min(1, Math.max(0, tt));
  const hMin = Math.max(minRectHeightPx, oneLineBoxHeightPx(cfg));
  const hCap = hCapPx(cfg, W, H);
  const widthMajor = W >= H;

  if (w <= 1e-9) {
    return {
      t,
      viewport: { W, H },
      w,
      widthMajor,
      distCenterToVblStart: 0,
      distCenterToVtr: 0,
      hMin,
      hCap,
      fitsViewportFinal: true,
      hFinal: 0,
      L: 0,
      centerScreen: { cx: 0, cy: H },
      boundsScreen: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      notes: [],
    };
  }

  const { cx: c0, cy: c0y } = centerFromRtlVlRblVb(w, hMin, W, H);
  const distStart = distCenterToVbl(c0, c0y, H);

  const { cx, cy, h } = geometryForFrame(tt, w, W, H, cfg, minRectHeightPx);
  const b = boundsRotated(cx, cy, w, h);
  const fits = fitsViewport(b, W, H, 0.25);
  const notes: string[] = [];
  if (!fits) {
    notes.push("Unexpected: geometryForFrame still outside viewport.");
  }

  const L = (w + h) / Math.SQRT2;

  return {
    t,
    viewport: { W, H },
    w,
    widthMajor,
    distCenterToVblStart: distStart,
    distCenterToVtr: distCenterToVtr(cx, cy, W),
    hMin,
    hCap,
    fitsViewportFinal: fits,
    hFinal: h,
    L,
    centerScreen: { cx, cy },
    boundsScreen: b,
    notes,
  };
}

function formatDebugOverlay(s: GeometryDebugSnapshot): string {
  const lines = [
    `t=${s.t.toFixed(4)}  viewport ${s.viewport.W}×${s.viewport.H}  w=${s.w.toFixed(2)}`,
    `major=${s.widthMajor ? "width" : "height"}  hMin=${s.hMin.toFixed(2)}  hCap=${s.hCap.toFixed(2)}  hFinal=${s.hFinal.toFixed(2)}`,
    `dist(center,VBL)@start=${s.distCenterToVblStart.toFixed(2)}  dist(center,VTR)=${s.distCenterToVtr.toFixed(2)}`,
    `fitsViewport=${s.fitsViewportFinal}`,
    `L=(w+h)/√2=${s.L.toFixed(2)}  center (${s.centerScreen.cx.toFixed(2)}, ${s.centerScreen.cy.toFixed(2)})`,
    `bounds screen [${s.boundsScreen.minX.toFixed(1)}, ${s.boundsScreen.maxX.toFixed(1)}] × [${s.boundsScreen.minY.toFixed(1)}, ${s.boundsScreen.maxY.toFixed(1)}]`,
    ...s.notes.map((n) => `→ ${n}`),
  ];
  return lines.join("\n");
}

declare global {
  interface Window {
    /** Present when `?debug=1` or `animationConfig.debug` is true */
    __ridingEdgesDebug?: {
      last: GeometryDebugSnapshot | null;
      copyDebugJson: () => Promise<void>;
    };
  }
}

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

/** Unrotated box height for exactly one line: top/bottom padding plus one line at lineHeightPx. */
function oneLineBoxHeightPx(cfg: Config): number {
  return cfg.paddingPx * 2 + cfg.lineHeightPx;
}

/**
 * Fixed width `w`, rotated -45°. Motion follows spec: VBL user origin, phases by major axis;
 * height is the maximum that fits under each contact constraint until symmetric distance to VTR.
 */
function geometryForFrame(
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

  const hMin = Math.max(minRectHeightPx, oneLineBoxHeightPx(cfg));
  const hCap = hCapPx(cfg, W, H);

  if (W >= H) {
    return geometryWidthMajor(tt, w, W, H, hMin, hCap);
  }
  return geometryHeightMajor(tt, w, W, H, hMin, hCap);
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
  const debugEnabled = isDebugEnabled(cfg);
  let debugPre: HTMLPreElement | null = null;

  if (debugEnabled) {
    const wrap = document.createElement("div");
    wrap.setAttribute("data-riding-edges-debug", "");
    wrap.className =
      "fixed bottom-0 right-0 z-[100] flex max-h-[min(70vh,520px)] max-w-[min(100vw,560px)] flex-col overflow-hidden";
    wrap.style.pointerEvents = "auto";
    wrap.style.font = '11px/1.35 ui-monospace, monospace';
    wrap.style.background = "rgba(0,0,0,.92)";
    wrap.style.color = "#4ade80";
    wrap.style.border = "1px solid #3f3f46";
    wrap.style.borderBottom = "none";
    wrap.style.borderLeft = "none";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.alignItems = "center";
    btnRow.style.padding = "6px 10px";
    btnRow.style.borderBottom = "1px solid #3f3f46";
    btnRow.style.flexShrink = "0";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy JSON";
    btn.style.font = "inherit";
    btn.style.cursor = "pointer";
    btn.style.color = "#e4e4e7";
    btn.style.background = "#27272a";
    btn.style.padding = "2px 8px";
    btn.style.border = "1px solid #52525b";
    btn.style.borderRadius = "4px";

    const hint = document.createElement("span");
    hint.style.color = "#a1a1aa";
    hint.textContent = "riding-edges debug";

    btnRow.appendChild(btn);
    btnRow.appendChild(hint);
    debugPre = document.createElement("pre");
    debugPre.style.margin = "0";
    debugPre.style.padding = "10px";
    debugPre.style.whiteSpace = "pre-wrap";
    debugPre.style.wordBreak = "break-word";
    debugPre.style.overflow = "auto";
    debugPre.style.flex = "1";
    debugPre.style.minHeight = "0";

    wrap.appendChild(btnRow);
    wrap.appendChild(debugPre);
    document.body.appendChild(wrap);

    window.__ridingEdgesDebug = {
      last: null,
      async copyDebugJson() {
        const s = window.__ridingEdgesDebug?.last;
        if (!s) return;
        const text = JSON.stringify(s, null, 2);
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          console.warn("riding-edges: clipboard failed — dump:\n", text);
        }
      },
    };

    btn.addEventListener("click", () => {
      void window.__ridingEdgesDebug?.copyDebugJson();
    });
  }

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
  let minRectHeightPx = parseLengthWithViewport(
    cfg.minRectHeight,
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
    minRectHeightPx = parseLengthWithViewport(
      cfg.minRectHeight,
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
    const { cx, cy, h } = geometryForFrame(tt, widthPx, vw, vh, cfg, minRectHeightPx);
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

    if (debugEnabled && debugPre) {
      const snap = buildGeometryDebugSnapshot(tt, widthPx, vw, vh, cfg, minRectHeightPx);
      debugPre.textContent = formatDebugOverlay(snap);
      if (window.__ridingEdgesDebug) {
        window.__ridingEdgesDebug.last = snap;
      }
    }
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

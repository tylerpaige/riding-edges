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
    "Width stays constant; height is chosen so the rotated box keeps contact with the frame.",
    "End opposite where you started, still riding the edges.",
  ],
  /**
   * Fixed CSS width of the unrotated box (height is solved each frame). Supports px, em, rem, vw, vh, vmin, vmax.
   * Example: `"10vmin"` is 10% of the smaller viewport dimension.
   */
  rectWidth: "10vmin",
  /** Upper bound on solved height: fraction of min(viewport width, height). Use 1 to avoid clamping below the riding-line height. */
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

/** Local box coords (CSS: x right, y down) → screen position relative to center already applied. */
function localMidToScreen(cx: number, cy: number, lx: number, ly: number) {
  return {
    x: cx + lx * COS_M45 - ly * SIN_M45,
    y: cy + lx * SIN_M45 + ly * COS_M45,
  };
}

/**
 * Pin local bottom-left corner (-w/2, h/2) in CSS coords to screen (t·W, (1−t)·H) — the viewport
 * diagonal from bottom-left to top-right. This keeps the shape riding the frame as t increases.
 */
function centerFromPinnedBottomLeftVertex(
  t: number,
  w: number,
  height: number,
  W: number,
  H: number
): { cx: number; cy: number } {
  const tt = Math.min(1, Math.max(0, t));
  const vx = tt * W;
  const vy = H * (1 - tt);
  const lx = -w / 2;
  const ly = height / 2;
  const dx = lx * COS_M45 - ly * SIN_M45;
  const dy = lx * SIN_M45 + ly * COS_M45;
  return { cx: vx - dx, cy: vy - dy };
}

function minUPlusVVerticalEdgeMids(
  cx: number,
  cy: number,
  w: number,
  H: number
): { left: number; right: number; min: number } {
  const sL = localMidToScreen(cx, cy, -w / 2, 0);
  const sR = localMidToScreen(cx, cy, w / 2, 0);
  const sumL = sL.x + (H - sL.y);
  const sumR = sR.x + (H - sR.y);
  return { left: sumL, right: sumR, min: Math.min(sumL, sumR) };
}

/** Self-consistent h ≈ min(u+v) for vertical edge mids with pinned center (fixed-point). */
function solveHeightFromEdgeMidLines(
  tt: number,
  w: number,
  W: number,
  H: number,
  hMin: number,
  hMax: number
): number {
  let h = Math.max(hMin, Math.min(hMax, (hMin + hMax) / 2));
  for (let i = 0; i < 52; i++) {
    const { cx, cy } = centerFromPinnedBottomLeftVertex(tt, w, h, W, H);
    const m = minUPlusVVerticalEdgeMids(cx, cy, w, H).min;
    const hNew = Math.max(hMin, Math.min(hMax, m));
    if (Math.abs(hNew - h) < 0.015) {
      return hNew;
    }
    h = 0.55 * h + 0.45 * hNew;
  }
  return Math.max(hMin, Math.min(hMax, h));
}

export type GeometryDebugSnapshot = {
  /** Scroll progress 0..1 */
  t: number;
  viewport: { W: number; H: number };
  /** Unrotated width (px) */
  w: number;
  /** Legacy closed form (old AABB path); for comparison only */
  hRawFromRidingLineFormula: number;
  /** Pinned vertex target in screen space: (t·W, (1−t)·H) */
  pinnedVertexTargetScreen: { x: number; y: number };
  hMin: number;
  hCap: number;
  hAfterMinMaxClamp: number;
  /** Whether rotated bounds fit the viewport after all clamps */
  fitsViewportFinal: boolean;
  /** Set when we shrink h to fit the viewport */
  hFromMaxHeightFitOnly: number | null;
  hFinal: number;
  L: number;
  centerScreen: { cx: number; cy: number };
  boundsScreen: { minX: number; maxX: number; minY: number; maxY: number };
  /** Bottom-left origin, y up: u = x_screen, v = H − y_screen */
  leftVerticalEdgeMid: {
    local: { x: number; y: number };
    screen: { x: number; y: number };
    user: { u: number; v: number };
    uPlusV: number;
  };
  rightVerticalEdgeMid: {
    local: { x: number; y: number };
    screen: { x: number; y: number };
    user: { u: number; v: number };
    uPlusV: number;
  };
  minUPlusV: number;
  /** min(u+v) − hFinal; should be ~0 if construction matches */
  deltaMinUPlusVMinusH: number;
  notes: string[];
};

function buildGeometryDebugSnapshot(
  tt: number,
  w: number,
  W: number,
  H: number,
  cfg: Config
): GeometryDebugSnapshot {
  const t = Math.min(1, Math.max(0, tt));
  const hMin = oneLineBoxHeightPx(cfg);
  const hCap = cfg.maxHeightFraction * Math.min(W, H);
  const hRaw = heightFromRidingLineConstruction(t, w, W, H);
  const hAfterClamp = Math.max(hMin, Math.min(hRaw, hCap));
  const pinnedVertexTargetScreen = { x: t * W, y: H * (1 - t) };

  if (w <= 1e-9) {
    return {
      t,
      viewport: { W, H },
      w,
      hRawFromRidingLineFormula: hRaw,
      pinnedVertexTargetScreen,
      hMin,
      hCap,
      hAfterMinMaxClamp: hAfterClamp,
      fitsViewportFinal: true,
      hFromMaxHeightFitOnly: null,
      hFinal: 0,
      L: 0,
      centerScreen: { cx: 0, cy: H },
      boundsScreen: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      leftVerticalEdgeMid: {
        local: { x: 0, y: 0 },
        screen: { x: 0, y: 0 },
        user: { u: 0, v: 0 },
        uPlusV: 0,
      },
      rightVerticalEdgeMid: {
        local: { x: 0, y: 0 },
        screen: { x: 0, y: 0 },
        user: { u: 0, v: 0 },
        uPlusV: 0,
      },
      minUPlusV: 0,
      deltaMinUPlusVMinusH: 0,
      notes: [],
    };
  }

  const hSolveUnclamped = solveHeightFromEdgeMidLines(t, w, W, H, hMin, hCap);
  const { cx: cxTry, cy: cyTry } = centerFromPinnedBottomLeftVertex(
    t,
    w,
    hSolveUnclamped,
    W,
    H
  );
  const wouldOverflow = !fitsViewport(
    boundsRotated(cxTry, cyTry, w, hSolveUnclamped),
    W,
    H,
    0.25
  );
  const hFit = wouldOverflow ? maxHeightFitOnly(t, w, W, H, cfg) : null;
  const notes: string[] = [];
  if (wouldOverflow) {
    notes.push("Pinned solve overflowed viewport; h reduced via maxHeightFitOnly.");
  }

  const { cx, cy, h } = geometryForFrame(tt, w, W, H, cfg);
  const b = boundsRotated(cx, cy, w, h);
  const fits = fitsViewport(b, W, H, 0.25);
  if (!fits) {
    notes.push("Unexpected: geometryForFrame still outside viewport.");
  }

  const L = (w + h) / Math.SQRT2;
  const ll = { x: -w / 2, y: 0 };
  const lr = { x: w / 2, y: 0 };
  const sL = localMidToScreen(cx, cy, ll.x, ll.y);
  const sR = localMidToScreen(cx, cy, lr.x, lr.y);
  const uL = sL.x;
  const vL = H - sL.y;
  const uR = sR.x;
  const vR = H - sR.y;
  const sumL = uL + vL;
  const sumR = uR + vR;
  const minUPlusV = Math.min(sumL, sumR);

  return {
    t,
    viewport: { W, H },
    w,
    hRawFromRidingLineFormula: hRaw,
    pinnedVertexTargetScreen,
    hMin,
    hCap,
    hAfterMinMaxClamp: hAfterClamp,
    fitsViewportFinal: fits,
    hFromMaxHeightFitOnly: hFit,
    hFinal: h,
    L,
    centerScreen: { cx, cy },
    boundsScreen: b,
    leftVerticalEdgeMid: {
      local: ll,
      screen: sL,
      user: { u: uL, v: vL },
      uPlusV: sumL,
    },
    rightVerticalEdgeMid: {
      local: lr,
      screen: sR,
      user: { u: uR, v: vR },
      uPlusV: sumR,
    },
    minUPlusV,
    deltaMinUPlusVMinusH: minUPlusV - h,
    notes,
  };
}

function formatDebugOverlay(s: GeometryDebugSnapshot): string {
  const lines = [
    `t=${s.t.toFixed(4)}  viewport ${s.viewport.W}×${s.viewport.H}  w=${s.w.toFixed(2)}`,
    `pinned vertex screen (${s.pinnedVertexTargetScreen.x.toFixed(1)}, ${s.pinnedVertexTargetScreen.y.toFixed(1)})`,
    `legacy AABB formula h=${s.hRawFromRidingLineFormula.toFixed(2)}  hMin=${s.hMin}  hCap=${s.hCap.toFixed(2)}`,
    `h after legacy clamp=${s.hAfterMinMaxClamp.toFixed(2)}  hFinal=${s.hFinal.toFixed(2)}`,
    `fitsViewport=${s.fitsViewportFinal}  hFitOnly=${s.hFromMaxHeightFitOnly ?? "—"}`,
    `L=(w+h)/√2=${s.L.toFixed(2)}  center (${s.centerScreen.cx.toFixed(2)}, ${s.centerScreen.cy.toFixed(2)})`,
    `bounds screen [${s.boundsScreen.minX.toFixed(1)}, ${s.boundsScreen.maxX.toFixed(1)}] × [${s.boundsScreen.minY.toFixed(1)}, ${s.boundsScreen.maxY.toFixed(1)}]`,
    `left mid  user u+v=${s.leftVerticalEdgeMid.uPlusV.toFixed(2)}  (u=${s.leftVerticalEdgeMid.user.u.toFixed(2)}, v=${s.leftVerticalEdgeMid.user.v.toFixed(2)})`,
    `right mid user u+v=${s.rightVerticalEdgeMid.uPlusV.toFixed(2)}  (u=${s.rightVerticalEdgeMid.user.u.toFixed(2)}, v=${s.rightVerticalEdgeMid.user.v.toFixed(2)})`,
    `min(u+v)=${s.minUPlusV.toFixed(2)}  Δ(min−hFinal)=${s.deltaMinUPlusVMinusH.toFixed(4)}`,
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
 * Old AABB-path closed form (debug comparison only): assumed L = (w+h)/√2 center path.
 */
function heightFromRidingLineConstruction(tt: number, w: number, W: number, H: number): number {
  const t = Math.min(1, Math.max(0, tt));
  const denom = Math.SQRT2 - 1 + 2 * t;
  if (denom <= 1e-12) return 0;
  const num = t * ((W + H) * Math.SQRT2 - 2 * w);
  return Math.max(0, num / denom);
}

/** Largest height that fits in the viewport with pinned bottom-left vertex centering. */
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

  const boundsForHeight = (height: number) => {
    const { cx, cy } = centerFromPinnedBottomLeftVertex(tt, w, height, W, H);
    return boundsRotated(cx, cy, w, height);
  };

  let lo = 0;
  let hi = hSearchMax;
  for (let k = 0; k < 38; k++) {
    const mid = (lo + hi) / 2;
    const b = boundsForHeight(mid);
    if (fitsViewport(b, W, H, 0.25)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Fixed width `w`, rotated -45°. Center pins local bottom-left corner to viewport diagonal (tW, (1−t)H).
 * Height solves h ≈ min(u+v) for left/right vertical edge mids (user coords) via fixed-point iteration.
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
  const hCap = cfg.maxHeightFraction * Math.min(W, H);

  let h = solveHeightFromEdgeMidLines(tt, w, W, H, hMin, hCap);
  let { cx, cy } = centerFromPinnedBottomLeftVertex(tt, w, h, W, H);

  if (!fitsViewport(boundsRotated(cx, cy, w, h), W, H, 0.25)) {
    const hFit = maxHeightFitOnly(tt, w, W, H, cfg);
    h = Math.max(hMin, Math.min(h, hFit));
    ({ cx, cy } = centerFromPinnedBottomLeftVertex(tt, w, h, W, H));
  }

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

    if (debugEnabled && debugPre) {
      const snap = buildGeometryDebugSnapshot(tt, widthPx, vw, vh, cfg);
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

/**
 * Debug overlay — the entire file can be deleted (along with its import in
 * main.ts) when shipping without debug support.
 */
import { type Config } from "./config";
import {
  boundsRotated,
  distCenterToVbl,
  distCenterToVtr,
  fitsViewport,
  geometryForFrame,
  oneLineBoxHeightPx,
} from "./geometry";

// ── Type ──────────────────────────────────────────────────────────────────────

/**
 * A frozen snapshot of every computed value for a single animation frame.
 * Useful for understanding why the box is positioned where it is, and for
 * catching regressions in the geometry.
 */
export type GeometryDebugSnapshot = {
  /** Scroll progress 0..1 */
  t: number;
  viewport: { W: number; H: number };
  /** Unrotated width (px) */
  w: number;
  /** True when viewport is landscape (width ≥ height), which changes Phase B direction. */
  widthMajor: boolean;
  /** Distance from center to VBL at t=0 — should equal distCenterToVtr at t=1. */
  distCenterToVblStart: number;
  /** Distance from center to VTR at the current frame. */
  distCenterToVtr: number;
  hMin: number;
  /** Whether the rotated AABB is fully inside the viewport (should always be true). */
  fitsViewportFinal: boolean;
  hFinal: number;
  /** Half-diagonal of the rotated box: L = (w+h)/√2. */
  L: number;
  centerScreen: { cx: number; cy: number };
  boundsScreen: { minX: number; maxX: number; minY: number; maxY: number };
  notes: string[];
};

declare global {
  interface Window {
    /** Present when `?debug=1` or `animationConfig.debug` is true */
    __ridingEdgesDebug?: {
      last: GeometryDebugSnapshot | null;
      copyDebugJson: () => Promise<void>;
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the debug overlay should be shown.
 * Checks the config flag first, then falls back to the `?debug=1` query param
 * so debug mode can be activated without a code change.
 */
export function isDebugEnabled(cfg: Config): boolean {
  if (typeof window === "undefined") return false;
  if (cfg.debug) return true;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

/**
 * Computes a full snapshot of the geometry state at scroll progress `tt`.
 * Runs the same math as `geometryForFrame` and adds distance/bounds checks
 * so the overlay can surface problems at a glance.
 */
export function buildGeometryDebugSnapshot(
  tt: number,
  w: number,
  W: number,
  H: number,
  cfg: Config,
  minRectHeightPx: number
): GeometryDebugSnapshot {
  const t = Math.min(1, Math.max(0, tt));
  const hMin = Math.max(minRectHeightPx, oneLineBoxHeightPx(cfg));
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
      fitsViewportFinal: true,
      hFinal: 0,
      L: 0,
      centerScreen: { cx: 0, cy: H },
      boundsScreen: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      notes: [],
    };
  }

  // Re-derive the start position (t=0) to check the symmetry invariant:
  // dist(center, VBL) at start == dist(center, VTR) at end.
  const k0 = (w + hMin) / (2 * Math.SQRT2);
  const distStart = distCenterToVbl(k0, H - k0, H);

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
    fitsViewportFinal: fits,
    hFinal: h,
    L,
    centerScreen: { cx, cy },
    boundsScreen: b,
    notes,
  };
}

/**
 * Formats a snapshot as a compact multi-line string for display in the
 * debug overlay `<pre>` element. Each line shows one logical group of values.
 */
export function formatDebugOverlay(s: GeometryDebugSnapshot): string {
  const lines = [
    `t=${s.t.toFixed(4)}  viewport ${s.viewport.W}×${s.viewport.H}  w=${s.w.toFixed(2)}`,
    `major=${s.widthMajor ? "width" : "height"}  hMin=${s.hMin.toFixed(2)}  hFinal=${s.hFinal.toFixed(2)}`,
    `dist(center,VBL)@start=${s.distCenterToVblStart.toFixed(2)}  dist(center,VTR)=${s.distCenterToVtr.toFixed(2)}`,
    `fitsViewport=${s.fitsViewportFinal}`,
    `L=(w+h)/√2=${s.L.toFixed(2)}  center (${s.centerScreen.cx.toFixed(2)}, ${s.centerScreen.cy.toFixed(2)})`,
    `bounds screen [${s.boundsScreen.minX.toFixed(1)}, ${s.boundsScreen.maxX.toFixed(1)}] × [${s.boundsScreen.minY.toFixed(1)}, ${s.boundsScreen.maxY.toFixed(1)}]`,
    ...s.notes.map((n) => `→ ${n}`),
  ];
  return lines.join("\n");
}

// ── DOM ───────────────────────────────────────────────────────────────────────

/**
 * Builds and appends the debug overlay to `document.body`.
 * Returns the `<pre>` element whose `textContent` should be updated each frame,
 * and wires up `window.__ridingEdgesDebug` for console access.
 *
 * Call only when `isDebugEnabled` is true — this function has side effects.
 */
export function mountDebugOverlay(): HTMLPreElement {
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

  const pre = document.createElement("pre");
  pre.style.margin = "0";
  pre.style.padding = "10px";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-word";
  pre.style.overflow = "auto";
  pre.style.flex = "1";
  pre.style.minHeight = "0";

  btnRow.appendChild(btn);
  btnRow.appendChild(hint);
  wrap.appendChild(btnRow);
  wrap.appendChild(pre);
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

  return pre;
}

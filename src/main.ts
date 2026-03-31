import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";

import { animationConfig, resolveScript } from "./config";
// To remove debug support entirely: delete the next line and the `if (debugEnabled)` block below.
import { buildGeometryDebugSnapshot, formatDebugOverlay, isDebugEnabled, mountDebugOverlay } from "./debug";
import { geometryForFrame, parseLengthWithViewport } from "./geometry";
import { joinSegments, maxFittingSegmentCount } from "./text";

gsap.registerPlugin(ScrollTrigger);

function mount() {
  const root = document.getElementById("app");
  if (!root) throw new Error("#app missing");

  // The animated box element, rotated −45° in CSS.
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
  const rootFontPx =
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  const cfg = animationConfig;
  const segments = resolveScript(cfg.script);
  const debugEnabled = isDebugEnabled(cfg);
  // debugPre is the <pre> inside the overlay; null when debug is off.
  const debugPre = debugEnabled ? mountDebugOverlay() : null;

  // Set the document height so scroll range matches config.
  const scrollRangePx = 100 * cfg.scrollPixelsPerPercent * cfg.scrollHeightMultiplier;
  document.documentElement.style.setProperty(
    "--scroll-doc-height",
    `calc(100vh + ${scrollRangePx}px)`
  );

  // Resolved pixel values — updated on resize.
  let widthPx = parseLengthWithViewport(cfg.rectWidth, window.innerWidth, window.innerHeight, emPx, rootFontPx);
  let minRectHeightPx = parseLengthWithViewport(cfg.minRectHeight, window.innerWidth, window.innerHeight, emPx, rootFontPx);

  const updateMetrics = () => {
    widthPx = parseLengthWithViewport(cfg.rectWidth, window.innerWidth, window.innerHeight, emPx, rootFontPx);
    minRectHeightPx = parseLengthWithViewport(cfg.minRectHeight, window.innerWidth, window.innerHeight, emPx, rootFontPx);
  };

  // Called every scroll tick and on resize/font-load. Positions the box and
  // updates the text content to show as many script segments as will fit.
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

    // Show as many segments as fit in the current box — the box growing through
    // scroll is what naturally reveals more text.
    const fitCount = maxFittingSegmentCount(
      segments, innerW, innerH, cfg.pretextFont, cfg.lineHeightPx, segments.length
    );
    textEl.textContent = joinSegments(segments, fitCount);

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

  window.addEventListener("resize", () => {
    updateMetrics();
    ScrollTrigger.refresh();
    applyFrame(st.progress);
  }, { passive: true });

  if (document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      ScrollTrigger.refresh();
      applyFrame(st.progress);
    });
  }
}

mount();

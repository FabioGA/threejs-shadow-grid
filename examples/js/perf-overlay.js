// Dev-only frame-time overlay for the demo playground - not part of the
// published library. Runs its own rAF loop (independent of ShadowGrid's
// internal one, which isn't exposed to consumers) and reports an
// EMA-smoothed frame time alongside the perf-relevant `state` knobs, so
// manual before/after sweeps (instance count, shadowMapSize, shadows,
// pixel ratio) have a number to compare instead of eyeballing smoothness.
//
// Toggle with the "P" key (ignored while typing in a form field), or it
// stays open across reloads once shown once (persisted in localStorage).
import { state } from "./state.js";

const STORAGE_KEY = "shadow-grid-perf-overlay-visible";
// EMA smoothing weight per new sample - low enough to stay readable frame to
// frame, high enough to react within roughly half a second at 60fps.
const EMA_ALPHA = 0.1;

const el = document.createElement("div");
el.id = "perf-overlay";
Object.assign(el.style, {
  position: "fixed",
  bottom: "12px",
  left: "12px",
  zIndex: "1000",
  padding: "8px 10px",
  borderRadius: "6px",
  background: "rgba(10, 10, 15, 0.78)",
  color: "#e6e6ef",
  font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  pointerEvents: "none",
  whiteSpace: "pre",
  display: "none",
});
document.body.appendChild(el);

function isVisible() {
  return el.style.display !== "none";
}

function setVisible(visible) {
  el.style.display = visible ? "block" : "none";
  try {
    localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // Private browsing / storage disabled - overlay still works, just
    // won't remember its shown/hidden state across reloads.
  }
}

let emaFrameMs = null;
let lastFrameTime = performance.now();

function tick(now) {
  const frameMs = now - lastFrameTime;
  lastFrameTime = now;
  emaFrameMs = emaFrameMs === null ? frameMs : emaFrameMs + (frameMs - emaFrameMs) * EMA_ALPHA;

  if (isVisible()) {
    const fps = emaFrameMs > 0 ? 1000 / emaFrameMs : 0;
    el.textContent = [
      `frame: ${emaFrameMs.toFixed(1)}ms  (${fps.toFixed(0)} fps)`,
      `maxInstances: ${state.maxInstances}`,
      `shadowMapSize: ${state.shadowMapSize}`,
      `shadows: ${state.shadows}`,
      `maxPixelRatio: ${state.maxPixelRatio}`,
      "",
      "[P] toggle",
    ].join("\n");
  }

  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "p" || e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target;
  const isEditable =
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  if (isEditable) return;
  setVisible(!isVisible());
});

let initiallyVisible = false;
try {
  initiallyVisible = localStorage.getItem(STORAGE_KEY) === "1";
} catch {
  // ignore
}
setVisible(initiallyVisible);

requestAnimationFrame(tick);

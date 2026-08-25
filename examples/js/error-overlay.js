// Dev-only error/warning log overlay for the demo playground - not part of
// the published library. Model loading is fire-and-forget (ShadowGrid logs
// failures via console.error/warn instead of throwing into caller code, so
// one bad model in a mixed list doesn't take down the whole grid), which
// means a load failure is otherwise easy to miss unless devtools happens to
// be open. This mirrors that console output into an on-page overlay so it's
// easy to check right after swapping in a new model URL.
//
// Toggle with the "E" key (ignored while typing in a form field), or it
// stays open across reloads once shown once (persisted in localStorage).
const STORAGE_KEY = "shadow-grid-error-overlay-visible";
const MAX_ENTRIES = 30;

const el = document.createElement("div");
el.id = "error-overlay";
Object.assign(el.style, {
  position: "fixed",
  bottom: "12px",
  right: "12px",
  zIndex: "1000",
  width: "min(480px, calc(100vw - 24px))",
  maxHeight: "min(360px, calc(100vh - 24px))",
  overflowY: "auto",
  padding: "8px 10px",
  borderRadius: "6px",
  background: "rgba(10, 10, 15, 0.9)",
  color: "#e6e6ef",
  font: "12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  whiteSpace: "pre-wrap",
  display: "none",
});
document.body.appendChild(el);

const entries = [];
const LEVEL_COLOR = { error: "#ff6b6b", warn: "#ffd166", uncaught: "#ff6b6b" };

function isVisible() {
  return el.style.display !== "none";
}

function setVisible(visible) {
  el.style.display = visible ? "block" : "none";
  if (visible) render();
  try {
    localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
  } catch {
    // Private browsing / storage disabled - overlay still works, just
    // won't remember its shown/hidden state across reloads.
  }
}

function formatArgs(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function record(level, args) {
  const time = new Date().toLocaleTimeString();
  entries.push({ level, time, message: formatArgs(args) });
  if (entries.length > MAX_ENTRIES) entries.shift();
  if (isVisible()) render();
}

function render() {
  if (entries.length === 0) {
    el.textContent = "No errors/warnings logged yet.\n\n[E] toggle";
    return;
  }
  const lines = entries.map((e) => `[${e.time}] ${e.level.toUpperCase()}: ${e.message}`);
  el.textContent = [...lines, "", `[E] toggle · [C] clear (${entries.length}/${MAX_ENTRIES})`].join("\n");
}

const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);
console.error = (...args) => {
  record("error", args);
  originalError(...args);
};
console.warn = (...args) => {
  record("warn", args);
  originalWarn(...args);
};

window.addEventListener("error", (e) => record("uncaught", [e.error ?? e.message]));
window.addEventListener("unhandledrejection", (e) => record("uncaught", [e.reason]));

window.addEventListener("keydown", (e) => {
  const target = e.target;
  const isEditable =
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
  if (isEditable || e.metaKey || e.ctrlKey || e.altKey) return;

  const key = e.key.toLowerCase();
  if (key === "e") setVisible(!isVisible());
  else if (key === "c" && isVisible()) {
    entries.length = 0;
    render();
  }
});

let initiallyVisible = false;
try {
  initiallyVisible = localStorage.getItem(STORAGE_KEY) === "1";
} catch {
  // ignore
}
setVisible(initiallyVisible);

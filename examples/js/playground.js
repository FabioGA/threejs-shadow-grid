// Entry module: wires every GridConfig / LightConfig control to `state`,
// keeps the generated-code/JSON panel and the "Config playground" panel's
// own controls in sync, and boots both demo instances.
import { box } from "./box-demo.js";
import { applyConfigToState, generateCode } from "./config-transform.js";
import {
  bindCheckbox,
  bindColor,
  bindNumber,
  bindRange,
  bindSelect,
  renderColorPaletteRows,
  toggleSubgroup,
} from "./dom-bindings.js";
import { models } from "./models.js";
import { randomGridConfig } from "./random.js";
import "./feature-toggle.js";
import "./perf-overlay.js";
import { bg, codeOutput, configJson, scheduleApply, syncConfigJson } from "./render.js";
import "./section-nav.js";
import { defaultState, state } from "./state.js";

document.getElementById("playground-toggle").addEventListener("click", () => {
  document.getElementById("playground-panel").classList.toggle("open");
});
document.getElementById("open-playground-btn").addEventListener("click", () => {
  document.getElementById("playground-panel").classList.add("open");
});

bindRange("cellSize", "cellSize", (v) => `${v}px`);
bindSelect("objectSizeMode", "objectSizeMode", (v) =>
  toggleSubgroup(v, "fixed", "objectSize-fixed-group", "objectSize-range-group")
);
bindRange("objectSize", "objectSize", (v) => `${v}px`);
bindRange("objectSizeMin", "objectSizeMin", (v) => `${v}px`);
bindRange("objectSizeMax", "objectSizeMax", (v) => `${v}px`);
bindSelect("arrangement", "arrangement");
bindRange("jitter", "jitter", (v) => v.toFixed(2));
bindRange("rowOffset", "rowOffset", (v) => v.toFixed(2));
["X", "Y", "Z"].forEach((axis) => {
  bindSelect(`rotation${axis}Mode`, `rotation${axis}Mode`, (v) =>
    document.getElementById(`rotation${axis}-fixed-group`).classList.toggle("active", v === "fixed")
  );
  bindRange(`rotation${axis}Deg`, `rotation${axis}Deg`, (v) => `${v}°`);
});
["modelWeight0", "modelWeight1", "modelWeight2"].forEach((id, i) => {
  const input = document.getElementById(id);
  input.value = state.modelWeights[i];
  input.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    if (Number.isNaN(value)) return;
    state.modelWeights[i] = value;
    scheduleApply();
  });
});
bindRange("overscan", "overscan", (v) => v.toFixed(2));
bindSelect("maxInstancesMode", "maxInstancesMode", (v) =>
  document.getElementById("maxInstances-fixed-group").classList.toggle("active", v === "fixed")
);
bindNumber("maxInstances", "maxInstances");
bindNumber("seed", "seed");

bindSelect("colorsMode", "colorsMode", (v) =>
  toggleSubgroup(v, "single", "colors-single-group", "colors-palette-group")
);
bindColor("colorSingle", "colorSingle");
renderColorPaletteRows();
bindColor("backgroundColor", "backgroundColor");
bindCheckbox("backgroundTransparent", "backgroundTransparent");
bindCheckbox("matchBackground", "matchBackground");
bindRange("hardness", "hardness", (v) => v.toFixed(2));
bindCheckbox("shadows", "shadows");
bindRange("maxPixelRatio", "maxPixelRatio", (v) => v.toFixed(1));
bindCheckbox("adaptivePixelRatio", "adaptivePixelRatio");

bindSelect("lightType", "lightType", (v) =>
  document.getElementById("lightType-cursor-group").classList.toggle("active", v === "cursor")
);
bindRange("cursorHeight", "cursorHeight", (v) => `${v}px`);
bindSelect("lightMode", "lightMode");
bindSelect("lightStyle", "lightStyle");
bindRange("lightIntensity", "lightIntensity", (v) => v.toFixed(1));
bindCheckbox("autoSweepOnTouch", "autoSweepOnTouch");
bindRange("sweepSpeed", "sweepSpeed", (v) => v.toFixed(1));
bindRange("ambient", "ambient", (v) => v.toFixed(2));
bindRange("easing", "easing", (v) => v.toFixed(1));
bindColor("lightColor", "lightColor");
bindRange("lightHardness", "lightHardness", (v) => v.toFixed(2));
bindRange("shadowMapSize", "shadowMapSize", (v) => `${v}px`);

document.getElementById("copy-btn").addEventListener("click", async () => {
  const btn = document.getElementById("copy-btn");
  try {
    await navigator.clipboard.writeText(codeOutput.textContent);
    btn.textContent = "Copied!";
  } catch {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1200);
});

/** Reflects the current `state` onto every playground control (used by both Reset and JSON Save). */
function syncControlsFromState() {
  document.querySelectorAll("#playground-panel input, #playground-panel select").forEach((el) => {
    const key = el.id in state ? el.id : null;
    if (!key) return;
    if (el.type === "checkbox") el.checked = state[key];
    else el.value = state[key];
  });
  renderColorPaletteRows();
  ["modelWeight0", "modelWeight1", "modelWeight2"].forEach((id, i) => {
    document.getElementById(id).value = state.modelWeights[i];
  });
  toggleSubgroup(state.objectSizeMode, "fixed", "objectSize-fixed-group", "objectSize-range-group");
  document.getElementById("maxInstances-fixed-group").classList.toggle("active", state.maxInstancesMode === "fixed");
  ["X", "Y", "Z"].forEach((axis) => {
    document
      .getElementById(`rotation${axis}-fixed-group`)
      .classList.toggle("active", state[`rotation${axis}Mode`] === "fixed");
  });
  toggleSubgroup(state.colorsMode, "single", "colors-single-group", "colors-palette-group");
  document.getElementById("lightType-cursor-group").classList.toggle("active", state.lightType === "cursor");
  document.querySelectorAll("#playground-panel .val").forEach((span) => {
    const id = span.id.replace(/-val$/, "");
    const input = document.getElementById(id);
    if (input) input.dispatchEvent(new Event("input"));
  });
}

document.getElementById("randomize-bg-btn").addEventListener("click", async () => {
  applyConfigToState(await randomGridConfig(models), state);
  syncControlsFromState();
  scheduleApply();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  Object.assign(state, defaultState, {
    colorPalette: [...defaultState.colorPalette],
    colorWeights: [...defaultState.colorWeights],
    modelWeights: [...defaultState.modelWeights],
  });
  syncControlsFromState();
  scheduleApply();
});

document.getElementById("json-copy-btn").addEventListener("click", async () => {
  const btn = document.getElementById("json-copy-btn");
  try {
    await navigator.clipboard.writeText(configJson.value);
    btn.textContent = "Copied!";
  } catch {
    btn.textContent = "Copy failed";
  }
  setTimeout(() => (btn.textContent = "Copy"), 1200);
});

document.getElementById("json-save-btn").addEventListener("click", () => {
  const statusEl = document.getElementById("json-status");
  let parsed;
  try {
    parsed = JSON.parse(configJson.value);
  } catch (err) {
    statusEl.textContent = `Invalid JSON: ${err.message}`;
    statusEl.classList.add("error");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    statusEl.textContent = "Config JSON must be an object.";
    statusEl.classList.add("error");
    return;
  }
  applyConfigToState(parsed, state);
  syncControlsFromState();
  scheduleApply();
  statusEl.classList.remove("error");
  statusEl.textContent = "Applied.";
  setTimeout(() => {
    if (statusEl.textContent === "Applied.") statusEl.textContent = "";
  }, 1500);
});

codeOutput.textContent = generateCode(state);
syncConfigJson();

window.__grids = { bg, box };

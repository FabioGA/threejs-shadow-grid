// The main full-page playground ShadowGrid instance, plus the "state changed
// -> re-render everything" hub every control binding funnels through.
import { ShadowGrid } from "threejs-shadow-grid";
import { buildConfig, generateCode } from "./config-transform.js";
import { state } from "./state.js";

// buildConfig(state) always includes a weighted `models` entry (see
// config-transform.js), so the initial models list doesn't need to be
// passed separately here.
export const bg = new ShadowGrid({
  container: "#bg",
  ...buildConfig(state),
});

export const codeOutput = document.querySelector("#code-output code");
export const configJson = document.getElementById("config-json");

let updateScheduled = false;

/** Keeps the editable JSON box in sync with `state` - unless the user is actively editing it. */
export function syncConfigJson() {
  if (document.activeElement === configJson) return;
  configJson.value = JSON.stringify(buildConfig(state), null, 2);
}

export function scheduleApply() {
  if (updateScheduled) return;
  updateScheduled = true;
  requestAnimationFrame(() => {
    updateScheduled = false;
    bg.update(buildConfig(state));
    codeOutput.textContent = generateCode(state);
    syncConfigJson();
  });
}

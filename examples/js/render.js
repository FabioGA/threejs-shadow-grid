// The main full-page playground ShadowGrid instance, plus the "state changed
// -> re-render everything" hub every control binding funnels through.
import { ShadowGrid } from "threejs-shadow-grid";
import { buildConfig, generateCode } from "./config-transform.js";
import { models } from "./models.js";
import { state } from "./state.js";

export const bg = new ShadowGrid({
  container: "#bg",
  models,
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

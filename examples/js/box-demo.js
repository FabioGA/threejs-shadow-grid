// Recipe B: a separate, self-contained "contained box" ShadowGrid instance
// with its own "Randomize" button - independent of the full-page playground
// (`playground.js`) and its `state`.
import { ShadowGrid } from "threejs-shadow-grid";
import { models } from "./models.js";
import { randomGridConfig } from "./random.js";

export const box = new ShadowGrid({
  container: "#box-demo",
  models,
  cellSize: 140,
  objectSize: { min: 50, max: 100 },
  backgroundColor: "#1a1210",
  colors: ["#ff9d5c", "#ff5c8a", "#5cc8ff"],
  light: "hard",
  arrangement: "random",
  jitter: 0.6,
  rotation: "random",
});

document.getElementById("randomize-box-btn").addEventListener("click", async () => {
  const config = await randomGridConfig(models);
  box.update(config);
  document.getElementById("box-label").textContent = `contained box, arrangement: ${config.arrangement}`;
});

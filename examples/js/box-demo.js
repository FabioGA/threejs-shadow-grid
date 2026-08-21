// Recipe B: a separate, self-contained "contained box" ShadowGrid instance
// with its own "Randomize" button - independent of the full-page playground
// (`playground.js`) and its `state`.
import { ShadowGrid } from "threejs-shadow-grid";
import { models } from "./models.js";
import { randChoice, randAxisRotation, randColor, randInt, randRange } from "./random.js";

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

function randomBoxConfig() {
  const arrangement = randChoice(["grid", "random"]);
  const objectSizeIsRange = Math.random() < 0.5;
  const colorsMode = randChoice(["single", "palette", "weighted"]);

  let objectSize;
  if (objectSizeIsRange) {
    const a = randInt(30, 130);
    const b = randInt(30, 130);
    objectSize = { min: Math.min(a, b), max: Math.max(a, b) + randInt(10, 40) };
  } else {
    objectSize = randInt(50, 140);
  }

  let colors;
  if (colorsMode === "single") {
    colors = randColor();
  } else if (colorsMode === "palette") {
    colors = [randColor(), randColor(), randColor()];
  } else {
    colors = [randColor(), randColor(), randColor()].map((color) => ({ color, weight: randInt(1, 10) }));
  }

  return {
    models: models.map((model) => ({ model, weight: randInt(1, 10) })),
    cellSize: randInt(90, 260),
    objectSize,
    arrangement,
    jitter: arrangement === "random" ? randRange(0.15, 0.9) : 0.4,
    rowOffset: randChoice([0, 0, 0, 0.25, 0.5, -0.5, 1 / 3]),
    rotation: { x: randAxisRotation(), y: randAxisRotation(), z: randAxisRotation() },
    colors,
    backgroundColor: randColor(),
    matchBackground: Math.random() < 0.15,
    hardness: randRange(0, 1),
    shadows: true,
    light: {
      type: randChoice(["sun", "cursor"]),
      cursorHeight: randInt(80, 1200),
      mode: randChoice(["auto", "pointer", "sweep"]),
      style: randChoice(["soft", "medium", "hard"]),
      intensity: randRange(0.5, 1.6),
      autoSweepOnTouch: true,
      sweepSpeed: randRange(0.3, 3),
      ambient: randRange(0.2, 0.7),
      easing: randRange(1, 8),
      color: randColor(),
      hardness: randRange(0, 1),
    },
  };
}

document.getElementById("randomize-box-btn").addEventListener("click", () => {
  const config = randomBoxConfig();
  box.update(config);
  document.getElementById("box-label").textContent = `contained box, arrangement: ${config.arrangement}`;
});

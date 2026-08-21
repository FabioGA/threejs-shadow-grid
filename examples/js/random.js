// Small deterministic-enough random helpers for the "Randomize" demo button
// and the "+ Add color" palette editor - not used by the library itself.

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function randChoice(options) {
  return options[Math.floor(Math.random() * options.length)];
}

export function randColor() {
  return (
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );
}

export function randAxisRotation() {
  return Math.random() < 0.35 ? "random" : randInt(0, 360);
}

/**
 * A fully randomized GridConfig-shaped object, shared by both "Randomize"
 * buttons (full-page background and contained box).
 */
export function randomGridConfig(models) {
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

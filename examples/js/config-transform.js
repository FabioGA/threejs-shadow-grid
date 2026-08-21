// Conversion between the playground's flat control state (state.js) and a
// real GridConfig, in both directions.
import { models } from "./models.js";

export function axisRotationValue(mode, deg) {
  return mode === "random" ? "random" : deg;
}

/** Turns playground state into a real GridConfig patch (no container - that stays fixed on the live instance). */
export function buildConfig(s) {
  return {
    models: models.map((model, i) => ({ model, weight: s.modelWeights[i] })),
    cellSize: s.cellSize,
    objectSize: s.objectSizeMode === "range" ? { min: s.objectSizeMin, max: s.objectSizeMax } : s.objectSize,
    arrangement: s.arrangement,
    jitter: s.jitter,
    rowOffset: s.rowOffset,
    rotation: {
      x: axisRotationValue(s.rotationXMode, s.rotationXDeg),
      y: axisRotationValue(s.rotationYMode, s.rotationYDeg),
      z: axisRotationValue(s.rotationZMode, s.rotationZDeg),
    },
    overscan: s.overscan,
    maxInstances: s.maxInstances,
    colors:
      s.colorsMode === "palette"
        ? s.colorPalette.map((color, i) => ({ color, weight: s.colorWeights[i] }))
        : s.colorSingle,
    backgroundColor: s.backgroundTransparent ? "transparent" : s.backgroundColor,
    matchBackground: s.matchBackground,
    hardness: s.hardness,
    seed: s.seed,
    light: {
      type: s.lightType,
      cursorHeight: s.cursorHeight,
      mode: s.lightMode,
      style: s.lightStyle,
      intensity: s.lightIntensity,
      autoSweepOnTouch: s.autoSweepOnTouch,
      sweepSpeed: s.sweepSpeed,
      ambient: s.ambient,
      easing: s.easing,
      color: s.lightColor,
      hardness: s.lightHardness,
      shadowMapSize: s.shadowMapSize,
    },
    maxPixelRatio: s.maxPixelRatio,
    shadows: s.shadows,
  };
}

/** Renders the full, copy-pasteable ShadowGrid setup for the current state. */
export function generateCode(s) {
  const objectSize =
    s.objectSizeMode === "range" ? `{ min: ${s.objectSizeMin}, max: ${s.objectSizeMax} }` : `${s.objectSize}`;
  const axisCode = (mode, deg) => (mode === "random" ? '"random"' : `${deg}`);
  const rotation = `{ x: ${axisCode(s.rotationXMode, s.rotationXDeg)}, y: ${axisCode(s.rotationYMode, s.rotationYDeg)}, z: ${axisCode(s.rotationZMode, s.rotationZDeg)} }`;
  const colors =
    s.colorsMode === "palette"
      ? `[\n${s.colorPalette.map((c, i) => `    { color: "${c}", weight: ${s.colorWeights[i]} },`).join("\n")}\n  ]`
      : `"${s.colorSingle}"`;
  const backgroundColor = s.backgroundTransparent ? '"transparent"' : `"${s.backgroundColor}"`;
  const modelNames = ["model-a", "model-b", "model-c"];
  const modelsCode = `[\n${modelNames.map((name, i) => `    { model: "/path/to/${name}.stl", weight: ${s.modelWeights[i]} },`).join("\n")}\n  ]`;

  return `import { ShadowGrid } from "threejs-shadow-grid";

const grid = new ShadowGrid({
  container: "#your-container",
  models: ${modelsCode}, // one URL, an array of them, or [{ model, weight }] to control the mix
  cellSize: ${s.cellSize},
  objectSize: ${objectSize},
  arrangement: "${s.arrangement}",
  jitter: ${s.jitter},
  rowOffset: ${s.rowOffset},
  rotation: ${rotation},
  overscan: ${s.overscan},
  maxInstances: ${s.maxInstances},
  colors: ${colors},
  backgroundColor: ${backgroundColor},
  matchBackground: ${s.matchBackground},
  hardness: ${s.hardness},
  seed: ${s.seed},
  light: {
    type: "${s.lightType}",
    cursorHeight: ${s.cursorHeight},
    mode: "${s.lightMode}",
    style: "${s.lightStyle}",
    intensity: ${s.lightIntensity},
    autoSweepOnTouch: ${s.autoSweepOnTouch},
    sweepSpeed: ${s.sweepSpeed},
    ambient: ${s.ambient},
    easing: ${s.easing},
    color: "${s.lightColor}",
    hardness: ${s.lightHardness},
    shadowMapSize: ${s.shadowMapSize},
  },
  maxPixelRatio: ${s.maxPixelRatio},
  shadows: ${s.shadows},
});`;
}

/** Inverse of `buildConfig`: merges a (possibly partial) GridConfig-shaped object back into playground `state`. */
export function applyConfigToState(config, state) {
  // Only adopted when it matches this demo's fixed 3-model list shape
  // (weighted entries, same length as models.js) - a pasted config using a
  // different model list can't be represented by this demo's fixed-3 UI.
  if (
    Array.isArray(config.models) &&
    config.models.length === models.length &&
    config.models.every((entry) => entry && typeof entry === "object" && "weight" in entry)
  ) {
    state.modelWeights = config.models.map((entry) => entry.weight);
  }
  if ("cellSize" in config) state.cellSize = config.cellSize;
  if ("objectSize" in config) {
    if (config.objectSize && typeof config.objectSize === "object") {
      state.objectSizeMode = "range";
      state.objectSizeMin = config.objectSize.min;
      state.objectSizeMax = config.objectSize.max;
    } else {
      state.objectSizeMode = "fixed";
      state.objectSize = config.objectSize;
    }
  }
  if ("arrangement" in config) state.arrangement = config.arrangement;
  if ("jitter" in config) state.jitter = config.jitter;
  if ("rowOffset" in config) state.rowOffset = config.rowOffset;
  if (config.rotation) {
    ["X", "Y", "Z"].forEach((axis) => {
      const value = config.rotation[axis.toLowerCase()];
      if (value === undefined) return;
      if (value === "random") {
        state[`rotation${axis}Mode`] = "random";
      } else {
        state[`rotation${axis}Mode`] = "fixed";
        state[`rotation${axis}Deg`] = value;
      }
    });
  }
  if ("overscan" in config) state.overscan = config.overscan;
  if ("maxInstances" in config) state.maxInstances = config.maxInstances;
  if ("colors" in config) {
    if (typeof config.colors === "string") {
      state.colorsMode = "single";
      state.colorSingle = config.colors;
    } else if (Array.isArray(config.colors)) {
      state.colorsMode = "palette";
      state.colorPalette = [];
      state.colorWeights = [];
      config.colors.forEach((entry) => {
        const isWeighted = entry && typeof entry === "object";
        state.colorPalette.push(isWeighted ? entry.color : entry);
        state.colorWeights.push(isWeighted ? entry.weight : 1);
      });
    }
  }
  if ("backgroundColor" in config) {
    state.backgroundTransparent = config.backgroundColor === "transparent";
    if (!state.backgroundTransparent) state.backgroundColor = config.backgroundColor;
  }
  if ("matchBackground" in config) state.matchBackground = config.matchBackground;
  if ("hardness" in config) state.hardness = config.hardness;
  if ("seed" in config) state.seed = config.seed;
  if (config.light) {
    const l = config.light;
    if ("type" in l) state.lightType = l.type;
    if ("cursorHeight" in l) state.cursorHeight = l.cursorHeight;
    if ("mode" in l) state.lightMode = l.mode;
    if ("style" in l) state.lightStyle = l.style;
    if ("intensity" in l) state.lightIntensity = l.intensity;
    if ("autoSweepOnTouch" in l) state.autoSweepOnTouch = l.autoSweepOnTouch;
    if ("sweepSpeed" in l) state.sweepSpeed = l.sweepSpeed;
    if ("ambient" in l) state.ambient = l.ambient;
    if ("easing" in l) state.easing = l.easing;
    if ("color" in l) state.lightColor = l.color;
    if ("hardness" in l) state.lightHardness = l.hardness;
    if ("shadowMapSize" in l) state.shadowMapSize = l.shadowMapSize;
  }
  if ("maxPixelRatio" in config) state.maxPixelRatio = config.maxPixelRatio;
  if ("shadows" in config) state.shadows = config.shadows;
}

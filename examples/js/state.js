// Every GridConfig / LightConfig knob the playground exposes, as flat
// control-friendly state (see config-transform.js for the conversion to/from
// a real GridConfig). `state` is a single shared mutable object - every
// module that needs to read/write it imports this same reference.
export const defaultState = {
  cellSize: 130,
  objectSizeMode: "range",
  objectSize: 95,
  objectSizeMin: 85,
  objectSizeMax: 125,
  arrangement: "grid",
  jitter: 0.4,
  rowOffset: -0.5,
  // Relative weight per entry in models.js (same index order) - how often
  // each bundled STL renders. Equal by default, matching the implicit
  // equal-random pick an unweighted `models` array would give.
  modelWeights: [10, 5, 5],
  rotationXMode: "fixed",
  rotationXDeg: 240,
  rotationYMode: "random",
  rotationYDeg: 0,
  rotationZMode: "random",
  rotationZDeg: 0,
  overscan: 0.15,
  maxInstances: 4000,
  colorsMode: "palette",
  colorSingle: "#8fb8ff",
  colorPalette: ["#ffa8e2", "#85f200", "#56dbf5"],
  colorWeights: [1, 2, 2],
  backgroundColor: "#f637ea",
  backgroundTransparent: false,
  matchBackground: false,
  hardness: 0.25,
  shadows: true,
  maxPixelRatio: 2,
  adaptivePixelRatio: true,
  seed: 1337,
  lightType: "sun",
  cursorHeight: 1180,
  lightMode: "auto",
  lightStyle: "soft",
  lightIntensity: 0.8,
  autoSweepOnTouch: true,
  sweepSpeed: 2.5,
  ambient: 0.2,
  easing: 8,
  lightColor: "#f1a010",
  lightHardness: 0.25,
  // Matches the library's own default for `lightStyle: "soft"` (see
  // LIGHT_STYLE_PRESETS in src/defaults.ts) - the demo's control always
  // passes shadowMapSize explicitly (see config-transform.js), so it
  // doesn't inherit that preset default on its own; this keeps the demo's
  // out-of-the-box shadow cost representative of what a real consumer
  // ships instead of defaulting to the slider's max.
  shadowMapSize: 1024,
};

export const state = {
  ...defaultState,
  colorPalette: [...defaultState.colorPalette],
  colorWeights: [...defaultState.colorWeights],
  modelWeights: [...defaultState.modelWeights],
};

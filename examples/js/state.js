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
  // "auto" (default, matches the library default) sizes the backdrop
  // distance to clear the deepest loaded model; "fixed" uses the
  // shadowDistance number below as an explicit distance instead.
  shadowDistanceMode: "auto",
  shadowDistance: 150,
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
  // "auto" (default, matches the library default) sizes the grid to exactly
  // fill the container; "fixed" uses the maxInstances number below as an
  // explicit hard cap instead.
  maxInstancesMode: "auto",
  maxInstances: 4000,
  colorsMode: "palette",
  colorSingle: "#8fb8ff",
  colorPalette: ["#ffa8e2", "#85f200", "#56dbf5"],
  colorWeights: [1, 2, 2],
  backgroundColor: "#f637ea",
  backgroundTransparent: false,
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
  // The demo's control always passes shadowMapSize explicitly (see
  // config-transform.js), so it doesn't inherit the `lightStyle` preset's
  // own default (see LIGHT_STYLE_PRESETS in src/defaults.ts). Set above the
  // "soft" preset's 1024 default for crisper shadows out of the box.
  shadowMapSize: 2048,
};

export const state = {
  ...defaultState,
  colorPalette: [...defaultState.colorPalette],
  colorWeights: [...defaultState.colorWeights],
  modelWeights: [...defaultState.modelWeights],
};

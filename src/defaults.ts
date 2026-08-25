import type { LightConfig, LightStyle, RotationOrder } from "./types";

/** How many CSS pixels one Three.js world unit maps to (orthographic camera is scaled so this is exact). */
export const PIXELS_PER_UNIT = 100;

/** Default cell size, in CSS pixels, between neighboring object centers. */
export const DEFAULT_CELL_SIZE = 220;
/** Default object size, in CSS pixels (largest bounding-box dimension). */
export const DEFAULT_OBJECT_SIZE = 120;
export const DEFAULT_ARRANGEMENT = "grid" as const;
export const DEFAULT_JITTER = 0.4;
export const DEFAULT_SHADOW_DISTANCE = "auto" as const;
/** Clamp range for `GridConfig.shadowDistance`, in CSS px. MIN avoids a degenerate near-zero/negative backdrop gap; MAX keeps the backdrop inside the main orthographic camera's own far clip (see ShadowGrid's camera: position z=10, far=100). */
export const MIN_SHADOW_DISTANCE = 20;
export const MAX_SHADOW_DISTANCE = 8000;
/** Extra clearance added above the deepest model's radius (+ jitter) in "auto" mode, in CSS px - pure breathing room. */
export const SHADOW_DISTANCE_AUTO_CLEARANCE = 40;
/** Half-range coefficient for `arrangement: "random"`'s z-position jitter (world units, relative to `jitter * cellSizeUnits`) - see grid.ts's maxZJitterUnits(). */
export const RANDOM_ARRANGEMENT_MAX_Z_JITTER_FACTOR = 0.3;
export const DEFAULT_ROW_OFFSET = 0;
export const DEFAULT_ROTATION = 0;
export const DEFAULT_ROTATION_ORDER: RotationOrder = "XYZ";
export const DEFAULT_OVERSCAN = 0.15;
export const DEFAULT_MAX_INSTANCES = "auto" as const;
/**
 * The cap `maxInstances: "auto"` resolves to - not a target, just a last-resort
 * guard against a degenerate config (e.g. a tiny `cellSize` on a huge
 * container) generating an excessive instance count. Ordinary containers
 * never get close to this; the real limit in "auto" mode is however many
 * cells `cellSize` fits into the container (see `GridBuilder.rebuild`).
 */
export const MAX_INSTANCES_SAFETY_CEILING = 20000;
export const DEFAULT_BACKGROUND_COLOR = "#0a0a0f";
export const DEFAULT_COLORS = "#c9ccd6";
export const DEFAULT_MATCH_BACKGROUND = false;
export const DEFAULT_SEED = 1337;
export const DEFAULT_MAX_PIXEL_RATIO = 2;
export const DEFAULT_SHADOWS = true;
export const DEFAULT_ADAPTIVE_PIXEL_RATIO = true;

/**
 * Adaptive pixel ratio: once per ADAPTIVE_PIXEL_RATIO_CHECK_INTERVAL_MS, if
 * the EMA-smoothed frame time is over the "struggling" threshold, step the
 * live pixel ratio down (floor ADAPTIVE_PIXEL_RATIO_MIN); if it's under the
 * "comfortable" threshold, step back up toward maxPixelRatio. The gap
 * between the two thresholds is deliberate hysteresis so it doesn't hover
 * right at the boundary and "pump" the ratio up and down every check.
 * Never touches anything when frame time sits between the two - the common
 * case on hardware with headroom, where this is a complete no-op.
 */
export const ADAPTIVE_PIXEL_RATIO_MIN = 1;
export const ADAPTIVE_PIXEL_RATIO_STEP = 0.25;
export const ADAPTIVE_PIXEL_RATIO_CHECK_INTERVAL_MS = 1000;
/** EMA smoothing weight per frame sample - same shape as the demo's perf overlay. */
export const ADAPTIVE_PIXEL_RATIO_EMA_ALPHA = 0.1;
/** Step down once EMA frame time exceeds this (~45fps). */
export const ADAPTIVE_PIXEL_RATIO_FRAME_MS_STEP_DOWN = 22;
/** Step up once EMA frame time is under this (~71fps - comfortable headroom under a 60fps budget). */
export const ADAPTIVE_PIXEL_RATIO_FRAME_MS_STEP_UP = 14;

/**
 * How long a ResizeObserver callback waits for resizing to settle before
 * rebuilding the (potentially large) InstancedMesh grid - cheap viewport
 * metrics (canvas size, camera frustum, shadow bounds) still update on
 * every callback; only the expensive rebuild is debounced. `overscan`
 * covers the small edge gap while a rebuild is pending.
 */
export const RESIZE_REBUILD_DEBOUNCE_MS = 120;

export const DEFAULT_HARDNESS = 0;

/** Rubber-like-to-glossy material tuning: `hardness` (see GridConfig) lerps roughness/metalness/clearcoat between these endpoints. */
export const OBJECT_MATERIAL_ROUGHNESS_SOFT = 0.9;
export const OBJECT_MATERIAL_ROUGHNESS_HARD = 0.15;
export const OBJECT_MATERIAL_METALNESS_SOFT = 0;
export const OBJECT_MATERIAL_METALNESS_HARD = 0.6;
/**
 * Exactly 0, not just "low": three.js only compiles/runs the clearcoat
 * shader path (an extra BRDF lobe evaluated per-fragment, per-light) when
 * `material.clearcoat > 0` - any nonzero value pays the same shader cost
 * regardless of magnitude, so a small-but-nonzero soft-end value would
 * look softer with no perf benefit at all. At the default `hardness: 0`,
 * this also means clearcoat costs nothing more than plain
 * MeshStandardMaterial would, with no need for a material-class swap.
 */
export const OBJECT_MATERIAL_CLEARCOAT_SOFT = 0;
export const OBJECT_MATERIAL_CLEARCOAT_HARD = 0.9;
export const OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_SOFT = 0.35;
export const OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_HARD = 0.05;

/** Maps friendly light "style" presets to hand-tuned Three.js-ish values. */
export const LIGHT_STYLE_PRESETS: Record<
  LightStyle,
  {
    intensity: number;
    /** SpotLight.intensity for `type: "cursor"` - decay is fixed at 0 (see light.ts) to cancel its 1/distance^2 falloff. */
    cursorIntensity: number;
    distance: number;
    lightSize: number; // approximates a soft-shadow area light via PCFSoft + radius
    shadowMapSize: number;
    ambientBoost: number;
    /** Default `hardness` (see LightConfig) when the caller doesn't set one explicitly. */
    defaultHardness: number;
  }
> = {
  soft: {
    intensity: 1.4,
    cursorIntensity: 1.8,
    distance: 9,
    lightSize: 3.2,
    shadowMapSize: 1024,
    ambientBoost: 0.15,
    defaultHardness: 0.15,
  },
  medium: {
    intensity: 1.9,
    cursorIntensity: 2.5,
    distance: 7,
    lightSize: 1.6,
    shadowMapSize: 1536,
    ambientBoost: 0,
    defaultHardness: 0.5,
  },
  hard: {
    intensity: 2.6,
    cursorIntensity: 3.4,
    distance: 5.5,
    lightSize: 0.4,
    shadowMapSize: 2048,
    ambientBoost: -0.1,
    defaultHardness: 0.9,
  },
};

/** Shadow-map blur radius at hardness 0 (very soft) and 1 (very hard) - hardness lerps between these. */
export const MIN_SHADOW_RADIUS = 0.3;
export const MAX_SHADOW_RADIUS = 6.5;

/** Clamp range for `LightConfig.shadowMapSize` (perf guard - GPU memory grows with the square of this). */
export const MIN_SHADOW_MAP_SIZE = 256;
export const MAX_SHADOW_MAP_SIZE = 4096;

/** Clamp range for `LightConfig.cursorHeight`, in CSS pixels. */
export const MIN_CURSOR_HEIGHT = 40;
export const MAX_CURSOR_HEIGHT = 4000;

/** Widest half-angle (radians) the "cursor" spotlight cone opens to - under Three.js's PI/2 cap to avoid edge distortion. */
export const MAX_CURSOR_ANGLE = 1.15;

/** How far the "cursor" light's auto-sweep roams, as a fraction of the visible grid half-extent. */
export const CURSOR_SWEEP_FRACTION = 0.8;

export const DEFAULT_LIGHT: Required<LightConfig> = {
  style: "medium",
  intensity: 1,
  autoSweepOnTouch: true,
  sweepSpeed: 1,
  ambient: 0.45,
  easing: 8,
  color: "#ffffff",
  // hardness/shadowMapSize/cursorHeight are style-dependent; resolveLight()
  // always recomputes them unless the caller sets one explicitly.
  hardness: 0.5,
  shadowMapSize: 1536,
  mode: "auto",
  type: "sun",
  cursorHeight: 700,
};

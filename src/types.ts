/** Public configuration surface for ShadowGrid - friendly knobs instead of raw Three.js/lighting concepts. */

/** A URL (or already-fetched ArrayBuffer) pointing at a .stl, .glb, or .gltf file. */
export type ModelSource = string | ArrayBuffer;

/** `"stl"` or `"gltf"` (covers both .gltf and .glb). Normally auto-detected - see `WeightedModel.format`. */
export type ModelFormat = "stl" | "gltf";

/** One entry in a weighted model list - see `GridConfig.models`. Weights are relative, not required to sum to any total. */
export interface WeightedModel {
  model: ModelSource;
  weight: number;
  /**
   * Flat CSS color for this model, overriding any material(s) baked into a
   * GLTF/GLB file (same look STL models already get from `GridConfig.colors`).
   * No effect on STL, which has no material of its own and always uses
   * `colors` regardless of this field.
   */
  color?: string;
  /**
   * Forces format detection instead of auto-detecting from the source. Only
   * needed for a `.gltf` (not `.glb`) passed as a raw `ArrayBuffer` - unlike
   * `.glb`, plain-JSON glTF has no reliable magic number to sniff.
   */
  format?: ModelFormat;
}

/**
 * Non-weighted shorthand for one entry in a bare (non-weighted) `models`
 * array/value - either a bare source, or `{ model, color?, format? }`
 * without a `weight`.
 */
export type ModelEntry = ModelSource | { model: ModelSource; color?: string; format?: ModelFormat };

/** How objects are placed within the auto-filled grid. */
export type Arrangement = "grid" | "random";

/** Rotation around a single axis, in degrees. A number is exact; `"random"` picks independently per object (0-360°). */
export type AxisRotation = number | "random";

/**
 * Per-object rotation, in degrees. A bare `AxisRotation` applies to the
 * vertical (Y) axis only; `{ x?, y?, z? }` sets each axis independently
 * (omitted axes default to 0).
 */
export type RotationConfig = AxisRotation | { x?: AxisRotation; y?: AxisRotation; z?: AxisRotation };

/** `RotationConfig` after resolving the shorthand form - always has all three axes. */
export interface ResolvedRotationConfig {
  x: AxisRotation;
  y: AxisRotation;
  z: AxisRotation;
}

/** Target on-screen object size, in CSS pixels (largest bounding-box dimension). `{ min, max }` randomizes per object. */
export type SizeConfig = number | { min: number; max: number };

/** Simplified light presets: "soft" (diffuse, low-contrast), "medium" (balanced, default), "hard" (crisp, punchy). */
export type LightStyle = "soft" | "medium" | "hard";

export interface LightConfig {
  /** Overall softness/hardness of the shadow-casting light. Default: "medium". */
  style?: LightStyle;
  /**
   * How strongly the shadow moves as the pointer moves across the
   * container, 0-1. For `type: "cursor"`, only scales how far the
   * automatic sweep roams - following the pointer is always exact. Default: 1.
   */
  intensity?: number;
  /** On touch/no-pointer devices, drift the light on a slow automatic path so the effect still reads as "alive". Default: true. */
  autoSweepOnTouch?: boolean;
  /** Speed multiplier for the touch auto-sweep. Default: 1. */
  sweepSpeed?: number;
  /** Ambient fill light amount (0-1) so shadowed faces aren't pure black. Default: 0.45. */
  ambient?: number;
  /** How quickly the light eases toward its target (pointer or sweep waypoint). Higher = snappier. Default: 8. */
  easing?: number;
  /** CSS color for the key ("sun") light - tints both the light and the shadows it casts. Default: "#ffffff". */
  color?: string;
  /** Shadow crispness, 0 (soft) to 1 (hard), overriding `style`'s implied default. */
  hardness?: number;
  /**
   * Shadow map resolution in texels per side (clamped 256-4096). Higher is
   * crisper at the cost of GPU memory/render time. Defaults per `style`
   * (soft: 1024, medium: 1536, hard: 2048).
   */
  shadowMapSize?: number;
  /**
   * Input mode:
   * - "auto" (default) - sweeps until the first pointer move, then follows
   *   it; falls back to sweeping when the pointer leaves or idles.
   * - "pointer" - always follows the pointer.
   * - "sweep" - always auto-sweeps, ignoring the pointer.
   */
  mode?: "auto" | "pointer" | "sweep";
  /**
   * - "sun" (default) - parallel light like sunlight: every shadow points
   *   the same direction and length, regardless of grid position.
   * - "cursor" - a light hovering above the pointer/sweep point; shadows
   *   vary with distance to that point. See `cursorHeight`.
   */
  type?: "sun" | "cursor";
  /**
   * Only for `type: "cursor"`: height above the grid, in CSS pixels. Lower
   * = shorter nearby shadows, longer far ones (dramatic); higher reads more
   * like "sun". Defaults per `style`; may be raised automatically on very
   * large containers to keep the whole grid lit.
   */
  cursorHeight?: number;
}

/** One entry in a weighted color palette - see `ColorConfig`. Weights are relative, not required to sum to any total. */
export interface WeightedColor {
  color: string;
  weight: number;
}

/**
 * Color configuration for the rendered objects.
 * - A single CSS color string -> every object uses that color.
 * - An array of strings -> each object randomly picks one with equal
 *   probability (stable across re-renders via `seed`).
 * - An array of `{ color, weight }` -> instance count is partitioned across
 *   colors proportionally to weight (then shuffled), so e.g. 70/30 gives
 *   ~70%/30% exactly, not just a per-object chance.
 */
export type ColorConfig = string | string[] | WeightedColor[];

export interface GridConfig {
  /**
   * One or more STL/GLTF/GLB model URLs (or `{ model, ... }` entries). A
   * plain array picks one per cell with equal probability; `{ model, weight }`
   * entries control the exact per-model share instead (e.g. 70/30 -> ~70%/30%
   * of objects). See `WeightedModel.color` for per-model color overrides.
   */
  models: ModelEntry | ModelEntry[] | WeightedModel[];

  /** DOM element (or CSS selector) the scene mounts into and fills completely. */
  container: HTMLElement | string;

  // ---- Grid ------------------------------------------------------------
  /** Distance between neighboring object centers, in CSS pixels. Rows/columns auto-compute to fill the container. Default: 220. */
  cellSize?: number;
  /** Target on-screen size (largest bounding-box dimension), in CSS pixels. `{ min, max }` randomizes per object. Default: 120. */
  objectSize?: SizeConfig;
  /**
   * Distance from the grid plane (z=0) to the backdrop that catches the
   * cast shadow, in CSS pixels. `"auto"` (default) sizes it to clear the
   * deepest loaded model - across any rotation - plus arrangement jitter,
   * so objects never visually clip through the backdrop. Pass a number to
   * pin an exact distance instead; too small a value can let objects clip
   * through the backdrop, which may be an intentional stylized choice.
   */
  shadowDistance?: number | "auto";
  /** "grid" = aligned rows/columns. "random" = jittered position per cell. Default: "grid". */
  arrangement?: Arrangement;
  /** 0-1 amount of position jitter applied when arrangement is "random". Default: 0.4. */
  jitter?: number;
  /**
   * Horizontal offset per row, as a fraction of `cellSize`. Row `r` shifts
   * by `(r * rowOffset) mod 1` cell widths - `0.5` is a brick/masonry
   * pattern, `0.25` a diagonal cascade, `0` (default) a plain grid.
   */
  rowOffset?: number;
  /**
   * Object rotation, in degrees. A bare number or `"random"` rotates only
   * the vertical (Y) axis; `{ x, y, z }` controls each axis independently. Default: 0.
   */
  rotation?: RotationConfig;
  /** Extra rows/columns beyond the visible edges, as a fraction of the viewport (avoids pop-in on resize). Default: 0.15. */
  overscan?: number;
  /**
   * Total instances rendered at once. `"auto"` (default) sizes the grid to
   * exactly what the container needs - as many cells as `cellSize` fits
   * into its width/height (plus `overscan`), no scrolling involved so
   * nothing further off-screen is ever rendered - with a large internal
   * ceiling only as a guard against degenerate configs (e.g. a tiny
   * `cellSize` on a huge container). Pass a number instead for an explicit
   * hard cap.
   */
  maxInstances?: number | "auto";

  // ---- Appearance --------------------------------------------------------
  colors?: ColorConfig;
  /** Surface hardness/reflectivity, 0 (soft matte rubber, default) to 1 (hard, glossy). Blends roughness/metalness/clearcoat. */
  hardness?: number;
  /**
   * CSS color, or "transparent" to let the page's own background show
   * through - a shadow-only backdrop still darkens where shadowed. Default: "#0a0a0f".
   */
  backgroundColor?: string;
  /** Forces objects to exactly `backgroundColor` (ignoring `colors`), revealed only by their shadows. No effect if transparent. Default: false. */
  matchBackground?: boolean;
  /** Deterministic seed for random color/arrangement picks. Default: a fixed internal seed. */
  seed?: number;

  // ---- Light ---------------------------------------------------------
  light?: LightStyle | LightConfig;

  // ---- Rendering -------------------------------------------------------
  /** Cap devicePixelRatio for performance. Default: 2. */
  maxPixelRatio?: number;
  /** Enable soft shadows (shadow map). Default: true. */
  shadows?: boolean;
  /**
   * Automatically lower the live pixel ratio (down to 1x) under sustained
   * frame-time pressure, and raise it back toward `maxPixelRatio` once
   * there's headroom again. A no-op on hardware that never struggles - it
   * only ever kicks in when frames are actually slow. Default: true.
   */
  adaptivePixelRatio?: boolean;
}

/** Fully-resolved internal config (all optional fields filled in, unions narrowed). */
export interface ResolvedGridConfig extends Required<
  Omit<GridConfig, "light" | "colors" | "container" | "models" | "rotation" | "maxInstances">
> {
  light: Required<LightConfig>;
  colors: ColorConfig;
  container: HTMLElement;
  models: ModelSource[];
  /** Per-model weight, parallel to `models` - `null` when `models` wasn't given as weighted entries (equal-probability picking). */
  modelWeights: number[] | null;
  /** Per-model flat-color override, parallel to `models` - `null` entry means no override (GLTF keeps its baked material; STL uses `colors` as always). */
  modelColorOverrides: (string | null)[];
  /** Per-model explicit format override, parallel to `models` - `null` entry means auto-detect. */
  modelFormats: (ModelFormat | null)[];
  rotation: ResolvedRotationConfig;
  /** `"auto"` already resolved to a concrete cap - see `GridConfig.maxInstances`. */
  maxInstances: number;
}

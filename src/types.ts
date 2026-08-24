/** Public configuration surface for ShadowGrid - friendly knobs instead of raw Three.js/lighting concepts. */

/** A URL (or already-fetched ArrayBuffer) pointing at an .stl file. */
export type ModelSource = string | ArrayBuffer;

/** One entry in a weighted model list - see `GridConfig.models`. Weights are relative, not required to sum to any total. */
export interface WeightedModel {
  model: ModelSource;
  weight: number;
}

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
   * One or more STL model URLs. A plain array picks one per cell with
   * equal probability; `{ model, weight }` entries control the exact
   * per-model share instead (e.g. 70/30 -> ~70%/30% of objects).
   */
  models: ModelSource | ModelSource[] | WeightedModel[];

  /** DOM element (or CSS selector) the scene mounts into and fills completely. */
  container: HTMLElement | string;

  // ---- Grid ------------------------------------------------------------
  /** Distance between neighboring object centers, in CSS pixels. Rows/columns auto-compute to fill the container. Default: 220. */
  cellSize?: number;
  /** Target on-screen size (largest bounding-box dimension), in CSS pixels. `{ min, max }` randomizes per object. Default: 120. */
  objectSize?: SizeConfig;
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
  /** Safety cap on total instances rendered at once (perf guard). Default: 4000. */
  maxInstances?: number;

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
}

/** Fully-resolved internal config (all optional fields filled in, unions narrowed). */
export interface ResolvedGridConfig extends Required<
  Omit<GridConfig, "light" | "colors" | "container" | "models" | "rotation">
> {
  light: Required<LightConfig>;
  colors: ColorConfig;
  container: HTMLElement;
  models: ModelSource[];
  /** Per-model weight, parallel to `models` - `null` when `models` wasn't given as weighted entries (equal-probability picking). */
  modelWeights: number[] | null;
  rotation: ResolvedRotationConfig;
}

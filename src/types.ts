/**
 * Public configuration surface for ShadowGrid.
 *
 * The whole point of this config object is that someone with zero Three.js
 * or lighting knowledge can drop it into a site and get a good-looking
 * result. Every "advanced" concept (light rigs, shadow maps, camera math)
 * is collapsed into a small number of friendly knobs.
 */

/** One or more URLs (or already-fetched ArrayBuffers) pointing at .stl files. */
export type ModelSource = string | ArrayBuffer;

/** How objects are placed within the auto-filled grid. */
export type Arrangement = "grid" | "random";

/**
 * Rotation around a single axis, in degrees.
 * - A number -> every object gets that exact rotation on this axis.
 * - `"random"` -> each object gets an independent random rotation (0-360°) on this axis.
 */
export type AxisRotation = number | "random";

/**
 * Per-object rotation, in degrees.
 * - A bare `AxisRotation` (number or `"random"`) applies to the vertical
 *   (Y, "spin") axis only - x and z stay at 0. This is the common case and
 *   matches the pre-3-axis-support shorthand.
 * - `{ x?, y?, z? }` sets each axis independently; omitted axes default to 0.
 */
export type RotationConfig = AxisRotation | { x?: AxisRotation; y?: AxisRotation; z?: AxisRotation };

/** `RotationConfig` after resolving the shorthand form - always has all three axes. */
export interface ResolvedRotationConfig {
  x: AxisRotation;
  y: AxisRotation;
  z: AxisRotation;
}

/**
 * Target on-screen object size, in CSS pixels (largest bounding-box
 * dimension).
 * - A number -> every object is that exact size.
 * - `{ min, max }` -> each object gets an independent random size in that
 *   pixel range.
 */
export type SizeConfig = number | { min: number; max: number };

/**
 * Simplified light presets. Internally these map to a light intensity,
 * distance and shadow softness (penumbra / shadow map blur radius) so
 * users never have to touch raw Three.js lighting values.
 *
 * - "soft"   -> large, diffuse, low-contrast shadows (gentle, ambient feel)
 * - "medium" -> balanced, the default
 * - "hard"   -> small, crisp, high-contrast shadows (dramatic, punchy feel)
 */
export type LightStyle = "soft" | "medium" | "hard";

export interface LightConfig {
  /** Overall softness/hardness of the shadow-casting light. Default: "medium". */
  style?: LightStyle;
  /**
   * How strongly the shadow moves as the pointer moves across the container.
   * 0 = light barely reacts, 1 = light swings fully with the pointer. Default: 1.
   * For `type: "cursor"`, this only scales how far the automatic sweep
   * roams - following the pointer always tracks its exact position
   * regardless of this value.
   */
  intensity?: number;
  /**
   * On devices with no mouse (touch/no pointer detected), the light instead
   * drifts on a slow automatic path so the effect still reads as "alive".
   * Default: true.
   */
  autoSweepOnTouch?: boolean;
  /** Speed multiplier for the touch auto-sweep. Default: 1. */
  sweepSpeed?: number;
  /** Ambient fill light amount (0-1) so shadowed faces aren't pure black. Default: 0.45. */
  ambient?: number;
  /**
   * How quickly the light eases toward its target position - the pointer
   * (when following it) or the current auto-sweep waypoint (on touch).
   * Higher = snappier/more immediate response, lower = smoother/slower,
   * more languid motion. Default: 4.
   */
  easing?: number;
  /** CSS color for the key ("sun") light - tints both the light itself and the shadows it casts. Default: "#ffffff" (white). */
  color?: string;
  /**
   * Shadow crispness, 0 (very soft/diffuse) to 1 (very hard/crisp),
   * overriding the softness `style` would otherwise imply. Left unset, it
   * defaults to a value matching whichever `style` is active, so setting
   * only `style` behaves exactly as before - set `hardness` for finer
   * control than the three presets allow.
   */
  hardness?: number;
  /**
   * Shadow map resolution, in texels per side (clamped to 256-4096). Higher
   * values give crisper, less pixelated/blocky shadow edges - especially
   * noticeable on larger containers or grids with many cells spread across
   * the shadow frustum - at the cost of more GPU memory and render time.
   * Left unset, it defaults to a value matching whichever `style` is active
   * (soft: 1024, medium: 1536, hard: 2048), so setting only `style` behaves
   * exactly as before - set `shadowMapSize` directly for finer control, e.g.
   * pushing past "hard"'s 2048 up to a crisper 4096 without changing the
   * light's intensity/distance/softness.
   */
  shadowMapSize?: number;
  /**
   * Forces the light's input mode instead of the default hybrid behavior:
   * - "auto" (default) - starts in touch auto-sweep, switches to following
   *   the pointer on the first real pointer movement, and back to sweeping
   *   when the pointer leaves the container.
   * - "pointer" - always follows the pointer, never falls back to sweeping.
   * - "sweep" - always auto-sweeps, ignoring the pointer entirely.
   * Useful for previewing the touch experience on a desktop, or pinning
   * one behavior regardless of input device.
   */
  mode?: "auto" | "pointer" | "sweep";
  /**
   * Which kind of shadow-casting light to use:
   * - "sun" (default) - a distant light, like actual sunlight: every
   *   object's shadow points the same direction and is roughly the same
   *   length, no matter where it sits in the grid.
   * - "cursor" - a light that hovers directly above the exact spot on the
   *   grid your cursor is over (or wherever the automatic sweep currently
   *   is), like a lamp floating over the scene. Objects near that spot get
   *   short, spread-out shadows; objects further away get longer, more
   *   dramatic ones - the shadow shape actually changes across the grid,
   *   not just its direction. See `cursorHeight` to control how dramatic.
   */
  type?: "sun" | "cursor";
  /**
   * Only used when `type` is "cursor": how high above the grid the light
   * hovers, in CSS pixels. Lower = the light sits closer to the objects,
   * so nearby shadows stay short while far-away ones stretch out
   * dramatically (like a lamp just above a tabletop). Higher = shadows
   * even out and the effect starts to look more like the "sun" light.
   * Left unset, it defaults to a value matching whichever `style` is
   * active. On very wide/tall containers, an extremely low value may be
   * raised automatically just enough to keep the whole grid lit.
   */
  cursorHeight?: number;
}

/** One entry in a weighted color palette - see `ColorConfig`. */
export interface WeightedColor {
  /** CSS color string. */
  color: string;
  /**
   * Relative weight controlling what share of objects get this color.
   * Weights don't need to add up to any particular total - e.g. 50/30/20
   * reads naturally as percentages, or set weights equal to the exact
   * instance counts you want if you know your grid's total instance count
   * (visible in the generated code in the demo playground, or computable
   * as roughly `(width / cellSize) * (height / cellSize)`).
   */
  weight: number;
}

/**
 * Color configuration for the rendered objects.
 *
 * - A single CSS color string -> every object uses that color.
 * - An array of CSS color strings -> each object instance randomly picks
 *   one color from the array with equal probability (a deterministic seed
 *   can be supplied so the "random" choice is stable across re-renders /
 *   SSR hydration).
 * - An array of `{ color, weight }` -> like above, but each render's exact
 *   instance count is partitioned across colors proportionally to weight
 *   (then shuffled), so e.g. weights of 70/30 reliably give ~70%/30% of
 *   objects that color rather than just a 70/30 *chance* per object.
 */
export type ColorConfig = string | string[] | WeightedColor[];

export interface GridConfig {
  /**
   * One or more STL model URLs. If more than one is provided, each grid
   * cell randomly picks one of them (weighted equally).
   */
  models: ModelSource | ModelSource[];

  /** DOM element (or CSS selector) the scene mounts into and fills completely. */
  container: HTMLElement | string;

  // ---- Grid ------------------------------------------------------------
  /**
   * Size of each grid cell in CSS pixels (distance between neighboring
   * object centers on screen). Rows/columns are always auto-computed to
   * fully cover the container at this cell size ("infinite fill") - more
   * cells appear automatically on larger containers. Default: 220.
   */
  cellSize?: number;
  /**
   * Target on-screen size, in CSS pixels (largest bounding-box dimension),
   * each loaded model is normalized to. A fixed number gives every object
   * the same size; `{ min, max }` gives each object an independent random
   * size in that pixel range. Default: 120.
   */
  objectSize?: SizeConfig;
  /** "grid" = perfectly aligned rows/columns. "random" = jittered position per cell. Default: "grid". */
  arrangement?: Arrangement;
  /** 0-1 amount of position jitter applied when arrangement is "random". Default: 0.4. */
  jitter?: number;
  /**
   * Horizontal offset applied per row, as a fraction of `cellSize` (can be
   * negative). Row `r` is shifted by `(r * rowOffset) mod 1` cell widths,
   * so e.g. `0.5` gives a classic brick/masonry pattern (rows alternate
   * between unshifted and half-shifted), `0.25` a 4-row diagonal cascade,
   * and `0` (the default) a plain aligned grid. Independent of `arrangement`.
   */
  rowOffset?: number;
  /**
   * Object rotation, in degrees. A bare number or `"random"` rotates only
   * around the vertical (Y) axis; pass `{ x, y, z }` to control each axis
   * independently (each can itself be a fixed number or `"random"`).
   * Independent of `arrangement`. Default: 0 (no rotation on any axis).
   */
  rotation?: RotationConfig;
  /**
   * Extra rows/columns rendered beyond the visible edges, as a fraction of
   * the viewport (avoids visible pop-in while the camera/container moves).
   * Default: 0.15.
   */
  overscan?: number;
  /** Safety cap on total instances rendered at once (perf guard). Default: 4000. */
  maxInstances?: number;

  // ---- Appearance --------------------------------------------------------
  colors?: ColorConfig;
  /**
   * Surface hardness/reflectivity of objects, 0 (soft matte rubber, the
   * default) to 1 (hard, glossy, more reflective) - continuously blends
   * roughness, metalness, and clearcoat so higher values pick up sharper,
   * brighter highlights from the light. Default: 0.
   */
  hardness?: number;
  /**
   * CSS color, or "transparent" to let the page's own background show
   * through. In transparent mode a shadow-only backdrop still catches the
   * moving shadow (darkening the page background where shadowed), so
   * shadows stay visible while the unshadowed color remains exactly
   * whatever the page's CSS background is. Default: "#0a0a0f".
   */
  backgroundColor?: string;
  /**
   * When true, objects are forced to exactly the same color as
   * `backgroundColor` (ignoring `colors`), so objects are only revealed by
   * the shadows they cast rather than by any color contrast. Has no effect
   * if `backgroundColor` is `"transparent"`. Default: false.
   */
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
  rotation: ResolvedRotationConfig;
}

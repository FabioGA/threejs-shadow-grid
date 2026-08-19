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
}

/**
 * Color configuration for the rendered objects.
 *
 * - A single CSS color string -> every object uses that color.
 * - An array of CSS color strings -> each object instance randomly picks
 *   one color from the array (a deterministic seed can be supplied so the
 *   "random" choice is stable across re-renders / SSR hydration).
 */
export type ColorConfig = string | string[];

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
   * each loaded model is normalized to. Default: 120.
   */
  objectSize?: number;
  /** "grid" = perfectly aligned rows/columns. "random" = jittered position/rotation/scale per cell. Default: "grid". */
  arrangement?: Arrangement;
  /** 0-1 amount of position/rotation/scale jitter applied when arrangement is "random". Default: 0.4. */
  jitter?: number;
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
  /** CSS color, or "transparent" to let the page background show through. Default: "#0a0a0f". */
  backgroundColor?: string;
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
export interface ResolvedGridConfig
  extends Required<Omit<GridConfig, "light" | "colors" | "container" | "models">> {
  light: Required<LightConfig>;
  colors: ColorConfig;
  container: HTMLElement;
  models: ModelSource[];
}

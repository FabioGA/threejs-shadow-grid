import type { LightConfig, LightStyle } from "./types";

/** How many CSS pixels one Three.js world unit maps to (orthographic camera is scaled so this is exact). */
export const PIXELS_PER_UNIT = 100;

/** Default cell size, in CSS pixels, between neighboring object centers. */
export const DEFAULT_CELL_SIZE = 220;
/** Default object size, in CSS pixels (largest bounding-box dimension). */
export const DEFAULT_OBJECT_SIZE = 120;
export const DEFAULT_ARRANGEMENT = "grid" as const;
export const DEFAULT_JITTER = 0.4;
export const DEFAULT_ROTATION = 0;
export const DEFAULT_OVERSCAN = 0.15;
export const DEFAULT_MAX_INSTANCES = 4000;
export const DEFAULT_BACKGROUND_COLOR = "#0a0a0f";
export const DEFAULT_COLORS = "#c9ccd6";
export const DEFAULT_MATCH_BACKGROUND = false;
export const DEFAULT_SEED = 1337;
export const DEFAULT_MAX_PIXEL_RATIO = 2;
export const DEFAULT_SHADOWS = true;

export const DEFAULT_HARDNESS = 0;

/**
 * Rubber-like-to-glossy material tuning for grid objects: `hardness` (see
 * GridConfig) linearly blends roughness/metalness/clearcoat between these
 * "soft" (hardness 0, the default - a matte rubber look with near-zero
 * metalness and a soft clearcoat sheen) and "hard" (hardness 1 - smoother,
 * more metallic, with a sharper clearcoat) endpoints, so objects can read
 * anywhere from soft rubber to a hard, glossy, reflective surface.
 */
export const OBJECT_MATERIAL_ROUGHNESS_SOFT = 0.9;
export const OBJECT_MATERIAL_ROUGHNESS_HARD = 0.15;
export const OBJECT_MATERIAL_METALNESS_SOFT = 0;
export const OBJECT_MATERIAL_METALNESS_HARD = 0.6;
export const OBJECT_MATERIAL_CLEARCOAT_SOFT = 0.4;
export const OBJECT_MATERIAL_CLEARCOAT_HARD = 0.9;
export const OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_SOFT = 0.35;
export const OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_HARD = 0.05;

/**
 * Maps friendly light "style" presets to concrete Three.js-ish values.
 * These numbers are deliberately hand-tuned so every preset looks good
 * without the caller ever seeing a raw intensity/angle value.
 */
export const LIGHT_STYLE_PRESETS: Record<
  LightStyle,
  {
    intensity: number;
    distance: number;
    lightSize: number; // approximates a soft-shadow area light via PCFSoft + radius
    shadowMapSize: number;
    ambientBoost: number;
    /** Default `hardness` (see LightConfig) for this style, when the caller doesn't set one explicitly. */
    defaultHardness: number;
  }
> = {
  soft: {
    intensity: 1.4,
    distance: 9,
    lightSize: 3.2,
    shadowMapSize: 1024,
    ambientBoost: 0.15,
    defaultHardness: 0.15,
  },
  medium: {
    intensity: 1.9,
    distance: 7,
    lightSize: 1.6,
    shadowMapSize: 1536,
    ambientBoost: 0,
    defaultHardness: 0.5,
  },
  hard: {
    intensity: 2.6,
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

export const DEFAULT_LIGHT: Required<LightConfig> = {
  style: "medium",
  intensity: 1,
  autoSweepOnTouch: true,
  sweepSpeed: 1,
  ambient: 0.45,
  easing: 4,
  color: "#ffffff",
  // Actual default is style-dependent (see LIGHT_STYLE_PRESETS.defaultHardness);
  // resolveLight() always recomputes this unless the caller sets hardness explicitly.
  hardness: 0.5,
  mode: "auto",
};

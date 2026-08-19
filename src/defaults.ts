import type { LightConfig, LightStyle } from "./types";

/** How many CSS pixels one Three.js world unit maps to (orthographic camera is scaled so this is exact). */
export const PIXELS_PER_UNIT = 100;

/** Default cell size, in CSS pixels, between neighboring object centers. */
export const DEFAULT_CELL_SIZE = 220;
/** Default object size, in CSS pixels (largest bounding-box dimension). */
export const DEFAULT_OBJECT_SIZE = 120;
export const DEFAULT_ARRANGEMENT = "grid" as const;
export const DEFAULT_JITTER = 0.4;
export const DEFAULT_OVERSCAN = 0.15;
export const DEFAULT_MAX_INSTANCES = 4000;
export const DEFAULT_BACKGROUND_COLOR = "#0a0a0f";
export const DEFAULT_COLORS = "#c9ccd6";
export const DEFAULT_SEED = 1337;
export const DEFAULT_MAX_PIXEL_RATIO = 2;
export const DEFAULT_SHADOWS = true;

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
    shadowRadius: number;
    shadowMapSize: number;
    ambientBoost: number;
  }
> = {
  soft: {
    intensity: 1.4,
    distance: 9,
    lightSize: 3.2,
    shadowRadius: 6,
    shadowMapSize: 1024,
    ambientBoost: 0.15,
  },
  medium: {
    intensity: 1.9,
    distance: 7,
    lightSize: 1.6,
    shadowRadius: 3,
    shadowMapSize: 1536,
    ambientBoost: 0,
  },
  hard: {
    intensity: 2.6,
    distance: 5.5,
    lightSize: 0.4,
    shadowRadius: 0.6,
    shadowMapSize: 2048,
    ambientBoost: -0.1,
  },
};

export const DEFAULT_LIGHT: Required<LightConfig> = {
  style: "medium",
  intensity: 1,
  autoSweepOnTouch: true,
  sweepSpeed: 1,
  ambient: 0.45,
};

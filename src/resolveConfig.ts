import type { GridConfig, LightConfig, ModelSource, ResolvedGridConfig, SizeConfig } from "./types";
import {
  DEFAULT_ARRANGEMENT,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CELL_SIZE,
  DEFAULT_COLORS,
  DEFAULT_JITTER,
  DEFAULT_LIGHT,
  DEFAULT_MATCH_BACKGROUND,
  DEFAULT_MAX_INSTANCES,
  DEFAULT_MAX_PIXEL_RATIO,
  DEFAULT_OBJECT_SIZE,
  DEFAULT_OVERSCAN,
  DEFAULT_ROTATION,
  DEFAULT_SEED,
  DEFAULT_SHADOWS,
} from "./defaults";

function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (typeof container !== "string") return container;
  const el = document.querySelector(container);
  if (!el || !(el instanceof HTMLElement)) {
    throw new Error(`[threejs-shadow-grid] container selector "${container}" did not match an element.`);
  }
  return el;
}

function resolveLight(light: GridConfig["light"]): Required<LightConfig> {
  if (!light) return { ...DEFAULT_LIGHT };
  if (typeof light === "string") return { ...DEFAULT_LIGHT, style: light };
  return { ...DEFAULT_LIGHT, ...light };
}

function toModelArray(models: ModelSource | ModelSource[]): ModelSource[] {
  return Array.isArray(models) ? models : [models];
}

/**
 * The largest possible on-screen size `objectSize` can resolve to - used to
 * normalize loaded geometry, so per-instance size (when `objectSize` is a
 * `{ min, max }` range) can then be applied as an instance scale <= 1.
 */
export function maxObjectSize(objectSize: SizeConfig): number {
  return typeof objectSize === "number" ? objectSize : objectSize.max;
}

export function resolveConfig(config: GridConfig): ResolvedGridConfig {
  if (!config.models || (Array.isArray(config.models) && config.models.length === 0)) {
    throw new Error("[threejs-shadow-grid] config.models is required (an STL URL, or an array of them).");
  }

  const backgroundColor = config.backgroundColor ?? DEFAULT_BACKGROUND_COLOR;
  const matchBackground = config.matchBackground ?? DEFAULT_MATCH_BACKGROUND;

  const resolved: ResolvedGridConfig = {
    models: toModelArray(config.models),
    container: resolveContainer(config.container),
    cellSize: config.cellSize ?? DEFAULT_CELL_SIZE,
    objectSize: config.objectSize ?? DEFAULT_OBJECT_SIZE,
    arrangement: config.arrangement ?? DEFAULT_ARRANGEMENT,
    jitter: config.jitter ?? DEFAULT_JITTER,
    rotation: config.rotation ?? DEFAULT_ROTATION,
    overscan: config.overscan ?? DEFAULT_OVERSCAN,
    maxInstances: config.maxInstances ?? DEFAULT_MAX_INSTANCES,
    colors: matchBackground && backgroundColor !== "transparent" ? backgroundColor : config.colors ?? DEFAULT_COLORS,
    backgroundColor,
    matchBackground,
    seed: config.seed ?? DEFAULT_SEED,
    light: resolveLight(config.light),
    maxPixelRatio: config.maxPixelRatio ?? DEFAULT_MAX_PIXEL_RATIO,
    shadows: config.shadows ?? DEFAULT_SHADOWS,
  };

  return resolved;
}

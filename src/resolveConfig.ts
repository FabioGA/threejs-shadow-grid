import type {
  GridConfig,
  LightConfig,
  ModelSource,
  ResolvedGridConfig,
  ResolvedRotationConfig,
  RotationConfig,
  SizeConfig,
  WeightedModel,
} from "./types";
import {
  DEFAULT_ADAPTIVE_PIXEL_RATIO,
  DEFAULT_ARRANGEMENT,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_CELL_SIZE,
  DEFAULT_COLORS,
  DEFAULT_HARDNESS,
  DEFAULT_JITTER,
  DEFAULT_LIGHT,
  DEFAULT_MATCH_BACKGROUND,
  DEFAULT_MAX_INSTANCES,
  DEFAULT_MAX_PIXEL_RATIO,
  DEFAULT_OBJECT_SIZE,
  DEFAULT_OVERSCAN,
  DEFAULT_ROTATION,
  DEFAULT_ROW_OFFSET,
  DEFAULT_SEED,
  DEFAULT_SHADOWS,
  LIGHT_STYLE_PRESETS,
  MAX_CURSOR_HEIGHT,
  MAX_SHADOW_MAP_SIZE,
  MIN_CURSOR_HEIGHT,
  MIN_SHADOW_MAP_SIZE,
  PIXELS_PER_UNIT,
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
  const partial: LightConfig = !light ? {} : typeof light === "string" ? { style: light } : light;
  const style = partial.style ?? DEFAULT_LIGHT.style;
  // hardness's real default is style-dependent (soft/medium/hard read as
  // increasingly crisp shadows) unless the caller sets it explicitly.
  const hardness = partial.hardness ?? LIGHT_STYLE_PRESETS[style].defaultHardness;
  const rawShadowMapSize = partial.shadowMapSize ?? LIGHT_STYLE_PRESETS[style].shadowMapSize;
  const shadowMapSize = Math.round(Math.min(MAX_SHADOW_MAP_SIZE, Math.max(MIN_SHADOW_MAP_SIZE, rawShadowMapSize)));
  // cursorHeight's real default is style-dependent (mirrors the sun's distance) unless the caller sets it explicitly.
  const rawCursorHeight = partial.cursorHeight ?? LIGHT_STYLE_PRESETS[style].distance * PIXELS_PER_UNIT;
  const cursorHeight = Math.min(MAX_CURSOR_HEIGHT, Math.max(MIN_CURSOR_HEIGHT, rawCursorHeight));
  return { ...DEFAULT_LIGHT, ...partial, style, hardness, shadowMapSize, cursorHeight };
}

/** Resolves the rotation shorthand (bare axis value = Y-axis only) into an explicit x/y/z object. */
function resolveRotation(rotation: RotationConfig | undefined): ResolvedRotationConfig {
  const value = rotation ?? DEFAULT_ROTATION;
  if (typeof value === "number" || value === "random") {
    return { x: 0, y: value, z: 0 };
  }
  return { x: value.x ?? 0, y: value.y ?? 0, z: value.z ?? 0 };
}

/** A weighted model list is an array of `{ model, weight }` objects - distinct from an array of bare sources (strings, or ArrayBuffer instances, which are also typeof "object"). */
function isWeightedModelList(models: ModelSource[] | WeightedModel[]): models is WeightedModel[] {
  const first = models[0];
  return typeof first === "object" && !(first instanceof ArrayBuffer);
}

/** Splits `GridConfig.models` into the flat source list to load and, when given as weighted entries, the parallel per-model weights. */
function resolveModels(models: GridConfig["models"]): { models: ModelSource[]; modelWeights: number[] | null } {
  const list = Array.isArray(models) ? models : [models];
  if (isWeightedModelList(list)) {
    return { models: list.map((entry) => entry.model), modelWeights: list.map((entry) => entry.weight) };
  }
  return { models: list, modelWeights: null };
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
  const { models, modelWeights } = resolveModels(config.models);

  const resolved: ResolvedGridConfig = {
    models,
    modelWeights,
    container: resolveContainer(config.container),
    cellSize: config.cellSize ?? DEFAULT_CELL_SIZE,
    objectSize: config.objectSize ?? DEFAULT_OBJECT_SIZE,
    arrangement: config.arrangement ?? DEFAULT_ARRANGEMENT,
    jitter: config.jitter ?? DEFAULT_JITTER,
    rowOffset: config.rowOffset ?? DEFAULT_ROW_OFFSET,
    rotation: resolveRotation(config.rotation),
    overscan: config.overscan ?? DEFAULT_OVERSCAN,
    maxInstances: config.maxInstances ?? DEFAULT_MAX_INSTANCES,
    colors: matchBackground && backgroundColor !== "transparent" ? backgroundColor : (config.colors ?? DEFAULT_COLORS),
    hardness: config.hardness ?? DEFAULT_HARDNESS,
    backgroundColor,
    matchBackground,
    seed: config.seed ?? DEFAULT_SEED,
    light: resolveLight(config.light),
    maxPixelRatio: config.maxPixelRatio ?? DEFAULT_MAX_PIXEL_RATIO,
    shadows: config.shadows ?? DEFAULT_SHADOWS,
    adaptivePixelRatio: config.adaptivePixelRatio ?? DEFAULT_ADAPTIVE_PIXEL_RATIO,
  };

  return resolved;
}

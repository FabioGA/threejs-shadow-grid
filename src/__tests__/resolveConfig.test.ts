// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { maxObjectSize, resolveConfig } from "../resolveConfig";
import {
  DEFAULT_ARRANGEMENT,
  DEFAULT_CELL_SIZE,
  DEFAULT_OBJECT_SIZE,
  LIGHT_STYLE_PRESETS,
  MAX_CURSOR_HEIGHT,
  MAX_INSTANCES_SAFETY_CEILING,
  MAX_SHADOW_MAP_SIZE,
  MIN_CURSOR_HEIGHT,
  MIN_SHADOW_MAP_SIZE,
  PIXELS_PER_UNIT,
} from "../defaults";

function makeContainer(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("resolveConfig", () => {
  it("fills in defaults for an otherwise-empty config", () => {
    const container = makeContainer();
    const resolved = resolveConfig({ models: "/a.stl", container });
    expect(resolved.cellSize).toBe(DEFAULT_CELL_SIZE);
    expect(resolved.objectSize).toBe(DEFAULT_OBJECT_SIZE);
    expect(resolved.arrangement).toBe(DEFAULT_ARRANGEMENT);
    expect(resolved.models).toEqual(["/a.stl"]);
    expect(resolved.container).toBe(container);
  });

  it("wraps a single model source in an array", () => {
    const resolved = resolveConfig({ models: "/a.stl", container: makeContainer() });
    expect(resolved.models).toEqual(["/a.stl"]);
  });

  it("throws when models is missing", () => {
    expect(() => resolveConfig({ container: makeContainer() } as never)).toThrow(/models is required/);
  });

  it("throws when models is an empty array", () => {
    expect(() => resolveConfig({ models: [], container: makeContainer() })).toThrow(/models is required/);
  });

  it("resolves a string container selector to the matching element", () => {
    const el = makeContainer();
    el.id = "target";
    const resolved = resolveConfig({ models: "/a.stl", container: "#target" });
    expect(resolved.container).toBe(el);
  });

  it("throws when a string container selector matches nothing", () => {
    expect(() => resolveConfig({ models: "/a.stl", container: "#does-not-exist" })).toThrow(/did not match/);
  });

  describe("model resolution", () => {
    it("leaves modelWeights null for a single model source", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer() });
      expect(resolved.models).toEqual(["/a.stl"]);
      expect(resolved.modelWeights).toBeNull();
    });

    it("leaves modelWeights null for a plain array of model sources", () => {
      const resolved = resolveConfig({ models: ["/a.stl", "/b.stl"], container: makeContainer() });
      expect(resolved.models).toEqual(["/a.stl", "/b.stl"]);
      expect(resolved.modelWeights).toBeNull();
    });

    it("treats an ArrayBuffer source as a plain (unweighted) model, not a weighted entry", () => {
      const buffer = new ArrayBuffer(8);
      const resolved = resolveConfig({ models: [buffer], container: makeContainer() });
      expect(resolved.models).toEqual([buffer]);
      expect(resolved.modelWeights).toBeNull();
    });

    it("resolves a weighted model list into parallel models/modelWeights arrays", () => {
      const resolved = resolveConfig({
        models: [
          { model: "/a.stl", weight: 70 },
          { model: "/b.stl", weight: 30 },
        ],
        container: makeContainer(),
      });
      expect(resolved.models).toEqual(["/a.stl", "/b.stl"]);
      expect(resolved.modelWeights).toEqual([70, 30]);
    });
  });

  describe("light resolution", () => {
    it("resolves a bare style string to that style's preset defaults", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer(), light: "hard" });
      expect(resolved.light.style).toBe("hard");
      expect(resolved.light.hardness).toBe(LIGHT_STYLE_PRESETS.hard.defaultHardness);
      expect(resolved.light.shadowMapSize).toBe(LIGHT_STYLE_PRESETS.hard.shadowMapSize);
    });

    it("lets an explicit hardness/shadowMapSize override the style's preset defaults", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { style: "soft", hardness: 0.77, shadowMapSize: 2000 },
      });
      expect(resolved.light.hardness).toBe(0.77);
      expect(resolved.light.shadowMapSize).toBe(2000);
    });

    it("clamps shadowMapSize below the minimum", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { shadowMapSize: 10 },
      });
      expect(resolved.light.shadowMapSize).toBe(MIN_SHADOW_MAP_SIZE);
    });

    it("clamps shadowMapSize above the maximum", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { shadowMapSize: 999999 },
      });
      expect(resolved.light.shadowMapSize).toBe(MAX_SHADOW_MAP_SIZE);
    });

    it("defaults type to 'sun'", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer() });
      expect(resolved.light.type).toBe("sun");
    });

    it("resolves an explicit type", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { type: "cursor" },
      });
      expect(resolved.light.type).toBe("cursor");
    });

    it("defaults cursorHeight from the style preset's distance", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { style: "hard" },
      });
      expect(resolved.light.cursorHeight).toBe(LIGHT_STYLE_PRESETS.hard.distance * PIXELS_PER_UNIT);
    });

    it("lets an explicit cursorHeight override the style's default", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { style: "soft", cursorHeight: 900 },
      });
      expect(resolved.light.cursorHeight).toBe(900);
    });

    it("clamps cursorHeight below the minimum", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { cursorHeight: 1 },
      });
      expect(resolved.light.cursorHeight).toBe(MIN_CURSOR_HEIGHT);
    });

    it("clamps cursorHeight above the maximum", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        light: { cursorHeight: 999999 },
      });
      expect(resolved.light.cursorHeight).toBe(MAX_CURSOR_HEIGHT);
    });
  });

  describe("rotation resolution", () => {
    it("applies a bare number to the Y axis only", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer(), rotation: 45 });
      expect(resolved.rotation).toEqual({ x: 0, y: 45, z: 0 });
    });

    it("applies a bare 'random' to the Y axis only", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer(), rotation: "random" });
      expect(resolved.rotation).toEqual({ x: 0, y: "random", z: 0 });
    });

    it("defaults omitted axes to 0 in explicit form", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        rotation: { x: 10, z: "random" },
      });
      expect(resolved.rotation).toEqual({ x: 10, y: 0, z: "random" });
    });
  });

  describe("maxInstances resolution", () => {
    it("resolves the default ('auto') to the safety ceiling", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer() });
      expect(resolved.maxInstances).toBe(MAX_INSTANCES_SAFETY_CEILING);
    });

    it("resolves an explicit 'auto' to the safety ceiling", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer(), maxInstances: "auto" });
      expect(resolved.maxInstances).toBe(MAX_INSTANCES_SAFETY_CEILING);
    });

    it("keeps an explicit number as a hard cap", () => {
      const resolved = resolveConfig({ models: "/a.stl", container: makeContainer(), maxInstances: 500 });
      expect(resolved.maxInstances).toBe(500);
    });
  });

  describe("matchBackground", () => {
    it("forces colors to backgroundColor when matchBackground is true", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        matchBackground: true,
        backgroundColor: "#123456",
        colors: "#ffffff",
      });
      expect(resolved.colors).toBe("#123456");
    });

    it("does not override colors when backgroundColor is transparent", () => {
      const resolved = resolveConfig({
        models: "/a.stl",
        container: makeContainer(),
        matchBackground: true,
        backgroundColor: "transparent",
        colors: "#ffffff",
      });
      expect(resolved.colors).toBe("#ffffff");
    });
  });
});

describe("maxObjectSize", () => {
  it("returns the number itself for a fixed size", () => {
    expect(maxObjectSize(120)).toBe(120);
  });

  it("returns max for a { min, max } range", () => {
    expect(maxObjectSize({ min: 50, max: 150 })).toBe(150);
  });
});

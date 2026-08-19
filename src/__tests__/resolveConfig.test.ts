// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { maxObjectSize, resolveConfig } from "../resolveConfig";
import {
  DEFAULT_ARRANGEMENT,
  DEFAULT_CELL_SIZE,
  DEFAULT_OBJECT_SIZE,
  LIGHT_STYLE_PRESETS,
  MAX_SHADOW_MAP_SIZE,
  MIN_SHADOW_MAP_SIZE,
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

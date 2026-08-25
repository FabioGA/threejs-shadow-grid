// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { LightRig } from "../light";
import {
  DEFAULT_LIGHT,
  LIGHT_STYLE_PRESETS,
  MAX_CURSOR_ANGLE,
  MAX_SHADOW_RADIUS,
  MIN_SHADOW_RADIUS,
} from "../defaults";
import type { LightConfig } from "../types";

function buildContainer(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
  return el;
}

function buildLightConfig(overrides: Partial<LightConfig> = {}): Required<LightConfig> {
  return { ...DEFAULT_LIGHT, ...overrides };
}

function move(clientX: number, clientY: number) {
  window.dispatchEvent(new MouseEvent("pointermove", { clientX, clientY }));
}

describe("LightRig", () => {
  let rigs: LightRig[] = [];

  afterEach(() => {
    rigs.forEach((rig) => rig.dispose());
    rigs = [];
  });

  function makeRig(config: Required<LightConfig>, scene: THREE.Scene = new THREE.Scene()) {
    const rig = new LightRig(scene, buildContainer(), config);
    rigs.push(rig);
    return rig;
  }

  it("applies the style preset's intensity and hardness-derived shadow radius", () => {
    const rig = makeRig(buildLightConfig({ style: "medium", hardness: 0.5 }));
    expect(rig.key.intensity).toBe(LIGHT_STYLE_PRESETS.medium.intensity);
    const expectedRadius = THREE.MathUtils.lerp(MAX_SHADOW_RADIUS, MIN_SHADOW_RADIUS, 0.5);
    expect(rig.key.shadow.radius).toBeCloseTo(expectedRadius, 10);
  });

  it("sizes the shadow camera frustum from setShadowBounds", () => {
    const rig = makeRig(buildLightConfig({ style: "medium" }));
    rig.setShadowBounds(5, 3);
    const cam = rig.key.shadow.camera as THREE.OrthographicCamera;
    const margin = Math.max(5, 3) * 0.35 + 1;
    expect(cam.left).toBeCloseTo(-5 - margin, 10);
    expect(cam.right).toBeCloseTo(5 + margin, 10);
    expect(cam.top).toBeCloseTo(3 + margin, 10);
    expect(cam.bottom).toBeCloseTo(-3 - margin, 10);
    expect(cam.far).toBeCloseTo(LIGHT_STYLE_PRESETS.medium.distance * 3 + 20 + 1, 10); // +1: default backdropDistanceUnits
  });

  it("setBackdropDistance() shifts the sun light's shadow camera far plane", () => {
    const rig = makeRig(buildLightConfig({ style: "medium" }));
    rig.setShadowBounds(5, 3);
    rig.setBackdropDistance(12);
    const cam = rig.key.shadow.camera as THREE.OrthographicCamera;
    expect(cam.far).toBeCloseTo(LIGHT_STYLE_PRESETS.medium.distance * 3 + 20 + 12, 10);
  });

  it("setBackdropDistance() shifts the cursor light's shadow camera far plane", () => {
    const rig = makeRig(buildLightConfig({ style: "medium", type: "cursor" }));
    rig.setShadowBounds(5, 3);
    const cam = rig.key.shadow.camera as THREE.PerspectiveCamera;
    const farAtDefault = cam.far;

    rig.setBackdropDistance(50);
    expect(cam.far).toBeGreaterThan(farAtDefault);
  });

  it("setBackdropDistance() before any setShadowBounds() call does not throw", () => {
    const rig = makeRig(buildLightConfig({ style: "medium" }));
    expect(() => rig.setBackdropDistance(5)).not.toThrow();
  });

  it("auto-sweeps continuously before any pointer activity in 'auto' mode", () => {
    const rig = makeRig(buildLightConfig({ mode: "auto" }));
    rig.update(0.5);
    const first = rig.key.position.clone();
    rig.update(0.5);
    const second = rig.key.position.clone();
    expect(first.distanceTo(second)).toBeGreaterThan(0);
  });

  it("switches to following the pointer once it moves inside the container, in 'auto' mode", () => {
    const rig = makeRig(buildLightConfig({ mode: "auto", easing: 100 }));
    move(100, 0); // top-right corner of the 100x100 container -> nx=1, ny=-1

    rig.update(1); // large delta + high easing so `current` reaches `target` in one step
    const settled = rig.key.position.clone();
    rig.update(1);
    const stillSettled = rig.key.position.clone();

    // Once locked onto the pointer, repeated updates should converge to (and stay at) a fixed point.
    expect(settled.distanceTo(stillSettled)).toBeCloseTo(0, 5);
  });

  it("drops back to auto-sweep when the pointer leaves the document, in 'auto' mode", () => {
    const rig = makeRig(buildLightConfig({ mode: "auto", easing: 100 }));
    move(100, 0);
    rig.update(1);
    const lockedX = rig.key.position.x;

    document.dispatchEvent(new Event("pointerleave"));
    rig.update(0.5);
    const first = rig.key.position.clone();
    rig.update(0.5);
    const second = rig.key.position.clone();

    // Sweeping again means position keeps moving instead of staying pinned at the pointer target.
    expect(first.distanceTo(second)).toBeGreaterThan(0);
    expect(second.x).not.toBe(lockedX);
  });

  it("resumes auto-sweep after the pointer stays still for a while, in 'auto' mode", () => {
    const rig = makeRig(buildLightConfig({ mode: "auto", easing: 100 }));
    move(100, 0);
    rig.update(1); // locks onto the pointer
    const locked = rig.key.position.clone();

    rig.update(1); // 2s idle total - still under the resume threshold, stays locked
    expect(rig.key.position.distanceTo(locked)).toBeCloseTo(0, 5);

    rig.update(5); // comfortably past the idle threshold - resumes sweeping
    const afterResume = rig.key.position.clone();
    rig.update(0.5);
    const later = rig.key.position.clone();
    expect(afterResume.distanceTo(later)).toBeGreaterThan(0); // moving again, not still locked
  });

  it("ignores pointer movement entirely in 'sweep' mode", () => {
    const rig = makeRig(buildLightConfig({ mode: "sweep", easing: 100 }));
    move(100, 0);
    rig.update(1);
    const first = rig.key.position.clone();
    rig.update(1);
    const second = rig.key.position.clone();
    expect(first.distanceTo(second)).toBeGreaterThan(0); // still sweeping, never locked to the pointer
  });

  it("dispose() removes its window/document listeners", () => {
    const rig = new LightRig(new THREE.Scene(), buildContainer(), buildLightConfig({ mode: "auto", easing: 100 }));
    rig.dispose();

    move(100, 0); // should be a no-op now
    rig.update(1);
    const first = rig.key.position.clone();
    rig.update(1);
    const second = rig.key.position.clone();

    // Still behaving like a pure sweep (position keeps drifting) since the pointermove had no effect.
    expect(first.distanceTo(second)).toBeGreaterThan(0);
  });

  it("dispose() removes the light, its target, and the ambient light from the scene", () => {
    const scene = new THREE.Scene();
    const rig = makeRig(buildLightConfig(), scene);
    const key = rig.key;
    expect(scene.children).toContain(key);
    rig.dispose();
    expect(scene.children).not.toContain(key);
    expect(scene.children).not.toContain(key.target);
    expect(scene.children).not.toContain(rig.ambient);
  });

  describe("type: 'sun' (default)", () => {
    it("adds a DirectionalLight to the scene", () => {
      const scene = new THREE.Scene();
      const rig = makeRig(buildLightConfig(), scene);
      expect(rig.key).toBeInstanceOf(THREE.DirectionalLight);
      expect(scene.children).toContain(rig.key);
    });
  });

  describe("type: 'cursor'", () => {
    it("adds a SpotLight to the scene", () => {
      const scene = new THREE.Scene();
      const rig = makeRig(buildLightConfig({ type: "cursor" }), scene);
      expect(rig.key).toBeInstanceOf(THREE.SpotLight);
      expect(scene.children).toContain(rig.key);
    });

    it("sets a sensible cone angle for ordinary bounds", () => {
      const rig = makeRig(buildLightConfig({ type: "cursor", cursorHeight: 700 }));
      rig.setShadowBounds(5, 3);
      const spot = rig.key as THREE.SpotLight;
      expect(spot.angle).toBeGreaterThan(0);
      expect(spot.angle).toBeLessThanOrEqual(MAX_CURSOR_ANGLE);
    });

    it("floors the effective height (clamping the cone angle) for a huge grid with a tiny cursorHeight", () => {
      const rig = makeRig(buildLightConfig({ type: "cursor", cursorHeight: 1 }));
      rig.setShadowBounds(500, 500);
      const spot = rig.key as THREE.SpotLight;
      expect(spot.angle).toBeCloseTo(MAX_CURSOR_ANGLE, 5);
    });

    it("follows the exact (unscaled) pointer position, ignoring intensity", () => {
      const rig = makeRig(buildLightConfig({ mode: "auto", easing: 100, type: "cursor", intensity: 0.2 }));
      rig.setShadowBounds(5, 3);
      move(100, 0); // top-right corner of the 100x100 container -> nx=1, ny=-1

      rig.update(1);
      const spot = rig.key as THREE.SpotLight;
      expect(spot.position.x).toBeCloseTo(5, 5);
      expect(spot.position.y).toBeCloseTo(3, 5);
    });

    it("points the target straight down at the point beneath the light", () => {
      const rig = makeRig(buildLightConfig({ mode: "auto", easing: 100, type: "cursor" }));
      rig.setShadowBounds(5, 3);
      move(100, 0);
      rig.update(1);
      const spot = rig.key as THREE.SpotLight;
      expect(spot.target.position.x).toBeCloseTo(spot.position.x, 5);
      expect(spot.target.position.y).toBeCloseTo(spot.position.y, 5);
      expect(spot.target.position.z).toBe(0);
    });

    it("auto-sweeps continuously, roaming within the visible grid extent", () => {
      const rig = makeRig(buildLightConfig({ mode: "auto", type: "cursor" }));
      rig.setShadowBounds(5, 3);
      rig.update(0.5);
      const first = rig.key.position.clone();
      rig.update(0.5);
      const second = rig.key.position.clone();
      expect(first.distanceTo(second)).toBeGreaterThan(0);
    });
  });

  describe("runtime type switching (updateConfig)", () => {
    it("swaps the underlying light in the scene from sun to cursor", () => {
      const scene = new THREE.Scene();
      const rig = makeRig(buildLightConfig({ type: "sun" }), scene);
      const sunLight = rig.key;
      rig.updateConfig(buildLightConfig({ type: "cursor" }));
      expect(scene.children).not.toContain(sunLight);
      expect(rig.key).toBeInstanceOf(THREE.SpotLight);
      expect(scene.children).toContain(rig.key);
    });

    it("swaps the underlying light in the scene from cursor to sun", () => {
      const scene = new THREE.Scene();
      const rig = makeRig(buildLightConfig({ type: "cursor" }), scene);
      const cursorLight = rig.key;
      rig.updateConfig(buildLightConfig({ type: "sun" }));
      expect(scene.children).not.toContain(cursorLight);
      expect(rig.key).toBeInstanceOf(THREE.DirectionalLight);
      expect(scene.children).toContain(rig.key);
    });
  });
});

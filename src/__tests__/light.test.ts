// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { LightRig } from "../light";
import { DEFAULT_LIGHT, LIGHT_STYLE_PRESETS, MAX_SHADOW_RADIUS, MIN_SHADOW_RADIUS } from "../defaults";
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

  function makeRig(config: Required<LightConfig>) {
    const rig = new LightRig(buildContainer(), config);
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
    expect(cam.far).toBeCloseTo(LIGHT_STYLE_PRESETS.medium.distance * 3 + 20, 10);
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
    const rig = new LightRig(buildContainer(), buildLightConfig({ mode: "auto", easing: 100 }));
    rig.dispose();

    move(100, 0); // should be a no-op now
    rig.update(1);
    const first = rig.key.position.clone();
    rig.update(1);
    const second = rig.key.position.clone();

    // Still behaving like a pure sweep (position keeps drifting) since the pointermove had no effect.
    expect(first.distanceTo(second)).toBeGreaterThan(0);
  });
});

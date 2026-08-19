import * as THREE from "three";
import { LIGHT_STYLE_PRESETS } from "./defaults";
import type { LightConfig } from "./types";

const TWO_PI = Math.PI * 2;

/**
 * Owns the single shadow-casting light (a directional "sun" whose angle
 * shifts with the pointer - cheap to render even with hundreds of grid
 * instances, unlike a per-instance point light) plus an ambient fill
 * light. Drives the light's angle from either the pointer (mouse/pen) or,
 * on touch/no-pointer devices, a slow automatic sweep so the "moving
 * shadow" effect is never just a static freeze-frame.
 *
 * This is the piece that lets non-lighting-experts get good results: the
 * public surface is just a "style" preset plus an intensity dial, never a
 * raw Three.js light API.
 */
export class LightRig {
  readonly key: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  private container: HTMLElement;
  private config: Required<LightConfig>;
  private usingPointer = false;
  private target = new THREE.Vector2(0, 0);
  private current = new THREE.Vector2(0, 0);
  private sweepT = Math.random() * TWO_PI;
  private reach = 4.5;
  private lightDistance = 7;
  private onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private onPointerLeave = () => this.handlePointerLeave();

  constructor(container: HTMLElement, config: Required<LightConfig>) {
    this.container = container;
    this.config = config;

    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.castShadow = true;
    this.key.target.position.set(0, 0, 0);
    this.ambient = new THREE.AmbientLight(0xffffff, 1);

    // Starts in "auto sweep" mode (no pointer activity has happened yet, so
    // there's nothing to follow). The first real pointermove - mouse, pen,
    // or a touch drag - switches to "follow the pointer" mode; leaving the
    // container drops back to sweeping instead of freezing the light in
    // place. This naturally covers touch devices too: if they never fire a
    // hover-style pointermove, the rig just keeps sweeping, which is the
    // desired behavior there.
    this.usingPointer = false;

    container.addEventListener("pointermove", this.onPointerMove);
    container.addEventListener("pointerleave", this.onPointerLeave);

    this.applyStyle();
  }

  updateConfig(config: Required<LightConfig>) {
    this.config = config;
    this.applyStyle();
  }

  /** Sizes the directional light's orthographic shadow frustum to fully cover the grid. */
  setShadowBounds(halfWidthUnits: number, halfHeightUnits: number) {
    const cam = this.key.shadow.camera as THREE.OrthographicCamera;
    const margin = Math.max(halfWidthUnits, halfHeightUnits) * 0.35 + 1;
    cam.left = -halfWidthUnits - margin;
    cam.right = halfWidthUnits + margin;
    cam.top = halfHeightUnits + margin;
    cam.bottom = -halfHeightUnits - margin;
    cam.near = 0.1;
    cam.far = this.lightDistance * 3 + 20;
    cam.updateProjectionMatrix();
  }

  private applyStyle() {
    const preset = LIGHT_STYLE_PRESETS[this.config.style];
    this.key.intensity = preset.intensity;
    this.key.shadow.radius = preset.shadowRadius;
    this.reach = preset.distance * 0.55;
    this.lightDistance = preset.distance;

    if (this.key.shadow.mapSize.width !== preset.shadowMapSize) {
      this.key.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.key.shadow.map?.dispose();
      (this.key.shadow as unknown as { map: null }).map = null;
    }
    this.key.shadow.bias = -0.0015;

    this.ambient.intensity = Math.max(0, this.config.ambient + preset.ambientBoost);
  }

  private handlePointerMove(e: PointerEvent) {
    this.usingPointer = true;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    this.target.set(nx, -ny).multiplyScalar(this.reach * this.config.intensity);
  }

  private handlePointerLeave() {
    // Drop back to the automatic sweep once the pointer leaves the
    // container, rather than freezing the light at its last spot.
    this.usingPointer = false;
  }

  /** Advances the auto-sweep (if active) and eases the light toward its target. Call once per frame. */
  update(deltaSeconds: number) {
    if (!this.usingPointer && this.config.autoSweepOnTouch) {
      this.sweepT += deltaSeconds * 0.35 * this.config.sweepSpeed;
      const x = Math.cos(this.sweepT) * this.reach * this.config.intensity;
      const y = Math.sin(this.sweepT * 1.3) * this.reach * 0.7 * this.config.intensity;
      this.target.set(x, y);
    }

    // Ease toward the target for a smooth, physical-feeling motion.
    this.current.lerp(this.target, Math.min(1, deltaSeconds * 4));
    this.key.position.set(this.current.x, this.current.y, this.lightDistance);
  }

  dispose() {
    this.container.removeEventListener("pointermove", this.onPointerMove);
    this.container.removeEventListener("pointerleave", this.onPointerLeave);
    this.key.shadow.map?.dispose();
  }
}

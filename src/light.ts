import * as THREE from "three";
import { LIGHT_STYLE_PRESETS, MAX_SHADOW_RADIUS, MIN_SHADOW_RADIUS } from "./defaults";
import type { LightConfig } from "./types";

const TWO_PI = Math.PI * 2;

/**
 * Angular frequencies (rad/s, before the sweepSpeed multiplier) for the two
 * sine terms summed per axis. Deliberately an incommensurate (non integer-
 * ratio) mix so the combined path only very loosely, if ever, repeats
 * within a normal viewing session, and - critically - the target position
 * is a continuous function of time that never comes to rest at a fixed
 * point (unlike a "pick a waypoint and ease to it" scheme, which visibly
 * pauses once it arrives and before the next waypoint is picked).
 */
const SWEEP_X_FREQ_1 = 0.21;
const SWEEP_X_FREQ_2 = 0.13;
const SWEEP_Y_FREQ_1 = 0.17;
const SWEEP_Y_FREQ_2 = 0.09;

/**
 * Owns the single shadow-casting light (a directional "sun" whose angle
 * shifts with the pointer - cheap to render even with hundreds of grid
 * instances, unlike a per-instance point light) plus an ambient fill
 * light. Drives the light's angle from either the pointer (mouse/pen) or,
 * on touch/no-pointer devices, a continuous organic drift (layered sine
 * waves at incommensurate frequencies) so the "moving shadow" effect never
 * freezes, never snaps, and never visibly pauses at any point along its
 * path - it's always in motion, and it never repeats a fixed loop either.
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
  private sweepTime = 0;
  private sweepPhaseX = Math.random() * TWO_PI;
  private sweepPhaseY = Math.random() * TWO_PI;
  private reach = 4.5;
  private lightDistance = 7;
  // Listened on window/document rather than the container: the container is
  // typically a full-bleed background sitting *behind* real page content
  // (z-index-wise), so page content stacked on top of it - text, the demo's
  // own control panel, anything - constantly "steals" the browser's
  // hit-test target as the pointer crosses it. A listener scoped to the
  // container only fires while the container itself is the topmost element
  // under the pointer, so on a typical page that's a small, gappy sliver of
  // the viewport - not the reliable "shadow follows the mouse anywhere on
  // the page" effect this is meant to be. Listening on window/document and
  // computing inside/outside from the container's own bounding rect (rather
  // than from native pointerenter/pointerleave, which fire off the same
  // occluded hit-test) sidesteps that entirely and also naturally covers a
  // full-viewport container, where "inside" is just "anywhere on screen".
  private onWindowPointerMove = (e: PointerEvent) => this.handleWindowPointerMove(e);
  private onDocumentPointerLeave = () => this.handleDocumentPointerLeave();

  constructor(container: HTMLElement, config: Required<LightConfig>) {
    this.container = container;
    this.config = config;

    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.castShadow = true;
    this.key.target.position.set(0, 0, 0);
    this.ambient = new THREE.AmbientLight(0xffffff, 1);

    // With mode "auto" (the default), starts in "auto sweep" mode (no
    // pointer activity has happened yet, so there's nothing to follow); the
    // first real pointermove - mouse, pen, or a touch drag - over the
    // container switches to "follow the pointer" mode, and moving off the
    // container (or off the page entirely) drops back to sweeping instead
    // of freezing the light in place. This naturally covers touch devices
    // too: if they never fire a hover-style pointermove, the rig just keeps
    // sweeping. mode "pointer"/"sweep" pin one of those two behaviors
    // regardless of actual pointer activity/position.
    this.usingPointer = config.mode === "pointer";

    window.addEventListener("pointermove", this.onWindowPointerMove);
    document.addEventListener("pointerleave", this.onDocumentPointerLeave);

    this.applyStyle();
  }

  updateConfig(config: Required<LightConfig>) {
    this.config = config;
    if (config.mode === "sweep") this.usingPointer = false;
    if (config.mode === "pointer") this.usingPointer = true;
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
    this.key.color.set(this.config.color);
    const hardness = THREE.MathUtils.clamp(this.config.hardness, 0, 1);
    this.key.shadow.radius = THREE.MathUtils.lerp(MAX_SHADOW_RADIUS, MIN_SHADOW_RADIUS, hardness);
    this.reach = preset.distance * 0.55;
    this.lightDistance = preset.distance;

    if (this.key.shadow.mapSize.width !== this.config.shadowMapSize) {
      this.key.shadow.mapSize.set(this.config.shadowMapSize, this.config.shadowMapSize);
      this.key.shadow.map?.dispose();
      (this.key.shadow as unknown as { map: null }).map = null;
    }
    this.key.shadow.bias = -0.0015;

    this.ambient.intensity = Math.max(0, this.config.ambient + preset.ambientBoost);
  }

  private handleWindowPointerMove(e: PointerEvent) {
    if (this.config.mode === "sweep") return;

    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

    if (this.config.mode === "pointer") {
      // Pinned to pointer-follow: keep tracking the pointer everywhere on
      // the page, not just while it happens to sit over the container -
      // "never fall back to sweeping" per the mode's contract.
      this.usingPointer = true;
    } else if (inside) {
      this.usingPointer = true;
    } else {
      // mode "auto", pointer outside the container - drop back to the
      // automatic sweep rather than freezing the light at its last spot.
      this.usingPointer = false;
      return;
    }

    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    this.target.set(nx, -ny).multiplyScalar(this.reach * this.config.intensity);
  }

  private handleDocumentPointerLeave() {
    // The pointer left the page/viewport entirely - drop back to the
    // automatic sweep rather than freezing the light at its last spot,
    // unless mode "pointer" pins it in place regardless.
    if (this.config.mode === "pointer") return;
    this.usingPointer = false;
  }

  /** Advances the auto-sweep (if active) and eases the light toward its target. Call once per frame. */
  update(deltaSeconds: number) {
    if (!this.usingPointer && this.config.autoSweepOnTouch) {
      this.sweepTime += deltaSeconds * this.config.sweepSpeed;
      const reach = this.reach * this.config.intensity;
      const x =
        (Math.sin(this.sweepTime * SWEEP_X_FREQ_1 + this.sweepPhaseX) * 0.6 +
          Math.sin(this.sweepTime * SWEEP_X_FREQ_2 + this.sweepPhaseX * 1.7) * 0.4) *
        reach;
      const y =
        (Math.sin(this.sweepTime * SWEEP_Y_FREQ_1 + this.sweepPhaseY) * 0.6 +
          Math.sin(this.sweepTime * SWEEP_Y_FREQ_2 + this.sweepPhaseY * 1.7) * 0.4) *
        reach *
        0.7;
      this.target.set(x, y);
    }

    // Ease toward the target for a smooth, physical-feeling motion. Since
    // the auto-sweep target above is itself always in motion, this never
    // lets `current` fully catch up and sit still - it's continuously
    // chasing a moving point rather than converging on a fixed one.
    this.current.lerp(this.target, Math.min(1, deltaSeconds * this.config.easing));
    this.key.position.set(this.current.x, this.current.y, this.lightDistance);
  }

  dispose() {
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    document.removeEventListener("pointerleave", this.onDocumentPointerLeave);
    this.key.shadow.map?.dispose();
  }
}

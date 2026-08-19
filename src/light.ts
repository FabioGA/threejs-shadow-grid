import * as THREE from "three";
import { LIGHT_STYLE_PRESETS } from "./defaults";
import type { LightConfig } from "./types";

const TWO_PI = Math.PI * 2;
/** Range (seconds, before the sweepSpeed multiplier) between auto-sweep waypoint changes. */
const SWEEP_WAYPOINT_MIN_DURATION = 1.4;
const SWEEP_WAYPOINT_MAX_DURATION = 3.6;

/**
 * Owns the single shadow-casting light (a directional "sun" whose angle
 * shifts with the pointer - cheap to render even with hundreds of grid
 * instances, unlike a per-instance point light) plus an ambient fill
 * light. Drives the light's angle from either the pointer (mouse/pen) or,
 * on touch/no-pointer devices, an automatic drift toward randomized
 * waypoints (eased rather than snapped to) so the "moving shadow" effect
 * reads as a natural, non-repeating flow instead of a static freeze-frame
 * or an obviously looping path.
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
  private sweepWaypoint = new THREE.Vector2(0, 0);
  private sweepWaypointTimer = 0;
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
    this.pickNextSweepWaypoint();
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

  /**
   * Picks a new random auto-sweep waypoint (angle + radius, both randomized
   * rather than a fixed circular path) and a randomized time-to-live for
   * it, so the drift never settles into an obviously repeating loop.
   * sweepSpeed scales how often waypoints change (i.e. how fast it drifts).
   */
  private pickNextSweepWaypoint() {
    const angle = Math.random() * TWO_PI;
    const radiusFactor = 0.25 + Math.random() * 0.75;
    const radius = this.reach * this.config.intensity * radiusFactor;
    this.sweepWaypoint.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7);

    const duration = SWEEP_WAYPOINT_MIN_DURATION + Math.random() * (SWEEP_WAYPOINT_MAX_DURATION - SWEEP_WAYPOINT_MIN_DURATION);
    this.sweepWaypointTimer = duration / Math.max(0.05, this.config.sweepSpeed);
  }

  /** Advances the auto-sweep (if active) and eases the light toward its target. Call once per frame. */
  update(deltaSeconds: number) {
    if (!this.usingPointer && this.config.autoSweepOnTouch) {
      this.sweepWaypointTimer -= deltaSeconds;
      if (this.sweepWaypointTimer <= 0) {
        this.pickNextSweepWaypoint();
      }
      this.target.copy(this.sweepWaypoint);
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

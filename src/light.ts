import * as THREE from "three";
import {
  CURSOR_SWEEP_FRACTION,
  LIGHT_STYLE_PRESETS,
  MAX_CURSOR_ANGLE,
  MAX_SHADOW_RADIUS,
  MIN_SHADOW_RADIUS,
  PIXELS_PER_UNIT,
} from "./defaults";
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
 * How long (in seconds) "auto" mode keeps following a stationary pointer
 * before giving up on it and resuming the auto-sweep. Long enough that
 * briefly pausing the pointer to look at something doesn't interrupt the
 * follow, short enough that a pointer left resting in place doesn't leave
 * the light frozen there indefinitely.
 */
const AUTO_IDLE_RESUME_SECONDS = 3;

/**
 * Owns the single shadow-casting light plus an ambient fill light, and
 * drives its movement from either the pointer (mouse/pen) or, on
 * touch/no-pointer devices, a continuous organic drift (layered sine waves
 * at incommensurate frequencies) so the "moving shadow" effect never
 * freezes, never snaps, and never visibly pauses at any point along its
 * path - it's always in motion, and it never repeats a fixed loop either.
 *
 * Two light types are supported (`LightConfig.type`):
 * - "sun" - a `THREE.DirectionalLight` whose angle swings with the
 *   pointer/sweep, cheap to render even with hundreds of grid instances
 *   (an orthographic shadow camera, one shadow map). Every object's shadow
 *   points the same way and is roughly the same length, regardless of
 *   where it sits in the grid - real parallel-ray sunlight.
 * - "cursor" - a `THREE.SpotLight` positioned directly above wherever the
 *   pointer/sweep currently is, aimed straight down at that spot. Because
 *   it radiates from a point rather than a fixed angle, shadows genuinely
 *   vary per-object based on distance to that point - still a single
 *   shadow map (unlike a `THREE.PointLight`, which would need a 6-face
 *   cubemap), just a perspective one instead of an orthographic one.
 *
 * This is the piece that lets non-lighting-experts get good results: the
 * public surface is just a "style" preset plus a handful of friendly
 * dials, never a raw Three.js light API.
 */
export class LightRig {
  readonly ambient: THREE.AmbientLight;
  private _key: THREE.DirectionalLight | THREE.SpotLight;
  private scene: THREE.Scene;
  private container: HTMLElement;
  private config: Required<LightConfig>;
  private usingPointer = false;
  private target = new THREE.Vector2(0, 0);
  private current = new THREE.Vector2(0, 0);
  private sweepTime = 0;
  private sweepPhaseX = Math.random() * TWO_PI;
  private sweepPhaseY = Math.random() * TWO_PI;
  /** Seconds since the last real pointer movement while locked onto it in "auto" mode - see AUTO_IDLE_RESUME_SECONDS. */
  private idleSeconds = 0;
  private reach = 4.5;
  private lightDistance = 7;
  /** "sun" light's/"cursor" light's shadow frustum half-extents, in world units - set by setShadowBounds(). */
  private halfWidthUnits = 5;
  private halfHeightUnits = 5;
  /** "cursor" light's height above the grid plane, in world units, as configured (before any full-coverage flooring). */
  private cursorHeightConfigured = 7;
  /** "cursor" light's actual height above the grid plane, in world units, after flooring for full coverage - see applyCursorShadowBounds(). */
  private cursorHeightWorld = 7;
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

  constructor(scene: THREE.Scene, container: HTMLElement, config: Required<LightConfig>) {
    this.scene = scene;
    this.container = container;
    this.config = config;

    this._key = this.createLight(config.type);
    this.ambient = new THREE.AmbientLight(0xffffff, 1);

    // With mode "auto" (the default), starts in "auto sweep" mode (no
    // pointer activity has happened yet, so there's nothing to follow); the
    // first real pointermove - mouse, pen, or a touch drag - over the
    // container switches to "follow the pointer" mode, and moving off the
    // container (or off the page entirely) drops back to sweeping instead
    // of freezing the light in place - and so does the pointer simply
    // sitting still for AUTO_IDLE_RESUME_SECONDS without leaving, so the
    // light never stays parked indefinitely just because the pointer
    // stopped moving. This naturally covers touch devices too: if they
    // never fire a hover-style pointermove, the rig just keeps sweeping.
    // mode "pointer"/"sweep" pin one of those two behaviors regardless of
    // actual pointer activity/position.
    this.usingPointer = config.mode === "pointer";

    this.scene.add(this._key, this._key.target, this.ambient);

    window.addEventListener("pointermove", this.onWindowPointerMove);
    document.addEventListener("pointerleave", this.onDocumentPointerLeave);

    this.applyStyle();
  }

  get key(): THREE.DirectionalLight | THREE.SpotLight {
    return this._key;
  }

  private createLight(type: Required<LightConfig>["type"]): THREE.DirectionalLight | THREE.SpotLight {
    const light = type === "cursor" ? new THREE.SpotLight(0xffffff, 1) : new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    light.target.position.set(0, 0, 0);
    return light;
  }

  updateConfig(config: Required<LightConfig>) {
    if (config.type !== this.config.type) {
      this.scene.remove(this._key, this._key.target);
      this._key.shadow.map?.dispose();
      this._key = this.createLight(config.type);
      this.scene.add(this._key, this._key.target);
    }
    this.config = config;
    if (config.mode === "sweep") this.usingPointer = false;
    if (config.mode === "pointer") this.usingPointer = true;
    this.applyStyle();
    // Re-derive shadow bounds (cursor cone angle/height clamp, sun's far
    // plane) from the new config right away, using the last-known viewport
    // extent - don't rely on the caller also calling setShadowBounds()
    // after this (ShadowGrid only does that on an actual resize/rebuild).
    this.setShadowBounds(this.halfWidthUnits, this.halfHeightUnits);
  }

  /** Sizes the light's shadow frustum/cone to fully cover the grid. Call whenever the container resizes. */
  setShadowBounds(halfWidthUnits: number, halfHeightUnits: number) {
    this.halfWidthUnits = halfWidthUnits;
    this.halfHeightUnits = halfHeightUnits;
    if (this._key instanceof THREE.SpotLight) {
      this.applyCursorShadowBounds(this._key, halfWidthUnits, halfHeightUnits);
    } else {
      this.applySunShadowBounds(this._key, halfWidthUnits, halfHeightUnits);
    }
  }

  private applySunShadowBounds(key: THREE.DirectionalLight, halfWidthUnits: number, halfHeightUnits: number) {
    const cam = key.shadow.camera as THREE.OrthographicCamera;
    const margin = Math.max(halfWidthUnits, halfHeightUnits) * 0.35 + 1;
    cam.left = -halfWidthUnits - margin;
    cam.right = halfWidthUnits + margin;
    cam.top = halfHeightUnits + margin;
    cam.bottom = -halfHeightUnits - margin;
    cam.near = 0.1;
    cam.far = this.lightDistance * 3 + 20;
    cam.updateProjectionMatrix();
  }

  private applyCursorShadowBounds(key: THREE.SpotLight, halfWidthUnits: number, halfHeightUnits: number) {
    const diag = Math.hypot(halfWidthUnits, halfHeightUnits);
    // A spotlight's cone has a hard angle limit, so it can't always cover
    // the whole grid corner-to-corner at a very low configured height on a
    // very large container - floor the *effective* height just enough to
    // keep the whole grid lit, recomputed fresh from the configured value
    // every time (not accumulated) so growing the container back out
    // un-floors it again.
    const minHeightForFullCoverage = diag / Math.tan(MAX_CURSOR_ANGLE);
    this.cursorHeightWorld = Math.max(this.cursorHeightConfigured, minHeightForFullCoverage);

    const margin = 1.05;
    key.angle = Math.min(MAX_CURSOR_ANGLE, Math.atan2(diag, this.cursorHeightWorld) * margin);

    const cam = key.shadow.camera as THREE.PerspectiveCamera;
    // SpotLightShadow's camera.far only auto-tracks SpotLight.distance when
    // distance is nonzero - decay is 0 (see applyStyle()) so distance is
    // deliberately left at 0 too, meaning far never auto-updates. Set both
    // planes explicitly, and keep the range as tight as the geometry allows:
    // a perspective shadow map's depth precision is heavily front-loaded
    // near its own near plane, so a needlessly wide near-far span (there's
    // nothing to shadow far above the light, or far past the backdrop)
    // starves the objects' actual depth range of precision and shows up as
    // shadow-acne artifacts - a bright fringe bleeding into the shadow -
    // especially on curved/angled surfaces.
    const clearance = 3; // world units of headroom above the light's target, so tall objects directly under the light don't get near-clipped out of the shadow map
    const farthestPoint = Math.sqrt(diag * diag + (this.cursorHeightWorld + 1) ** 2); // +1: the backdrop plane sits one unit behind the grid
    cam.near = Math.max(0.1, this.cursorHeightWorld - clearance);
    cam.far = farthestPoint + 1;
    cam.updateProjectionMatrix();
  }

  private applyStyle() {
    const preset = LIGHT_STYLE_PRESETS[this.config.style];
    this._key.color.set(this.config.color);
    const hardness = THREE.MathUtils.clamp(this.config.hardness, 0, 1);
    this._key.shadow.radius = THREE.MathUtils.lerp(MAX_SHADOW_RADIUS, MIN_SHADOW_RADIUS, hardness);

    if (this._key.shadow.mapSize.width !== this.config.shadowMapSize) {
      this._key.shadow.mapSize.set(this.config.shadowMapSize, this.config.shadowMapSize);
      this._key.shadow.map?.dispose();
      (this._key.shadow as unknown as { map: null }).map = null;
    }
    if (this._key instanceof THREE.SpotLight) {
      this._key.intensity = preset.cursorIntensity;
      // No distance attenuation: cursorHeight is a pure shadow-shape knob,
      // not a hidden brightness knob (the sun's intensity is likewise
      // distance-independent - lightDistance never dims it either).
      this._key.decay = 0;
      // Soft-edge cone falloff, riding the same shared `hardness` knob
      // rather than adding a separate field for it.
      this._key.penumbra = 1 - hardness;
      this.cursorHeightConfigured = this.config.cursorHeight / PIXELS_PER_UNIT;
      // A perspective shadow map (unlike the sun's orthographic one) needs
      // a much smaller depth bias plus a normal-oriented bias, or curved
      // surfaces (like a leaf/stem) show self-shadowing acne artifacts.
      this._key.shadow.bias = -0.0003;
      this._key.shadow.normalBias = 0.02;
    } else {
      this._key.intensity = preset.intensity;
      this.reach = preset.distance * 0.55;
      this.lightDistance = preset.distance;
      this._key.shadow.bias = -0.0015;
      this._key.shadow.normalBias = 0;
    }

    this.ambient.intensity = Math.max(0, this.config.ambient + preset.ambientBoost);
  }

  private handleWindowPointerMove(e: PointerEvent) {
    if (this.config.mode === "sweep") return;

    this.idleSeconds = 0;

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

    if (this.config.type === "cursor") {
      // The exact point on the grid the pointer is over - not scaled by
      // `intensity`, since "the exact point where the mouse is" is the
      // whole point of this light type. The camera is orthographic and
      // fixed at the origin, so mapping screen-normalized coordinates to
      // the world-space grid plane is exact, with no raycasting needed.
      this.target.set(nx * this.halfWidthUnits, -ny * this.halfHeightUnits);
    } else {
      this.target.set(nx, -ny).multiplyScalar(this.reach * this.config.intensity);
    }
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
    const isCursor = this.config.type === "cursor";

    if (this.usingPointer && this.config.mode === "auto") {
      this.idleSeconds += deltaSeconds;
      if (this.idleSeconds >= AUTO_IDLE_RESUME_SECONDS) {
        // The pointer hasn't moved in a while - drop back to the automatic
        // sweep rather than leaving the light frozen in place. The lerp
        // below eases `current` toward `target` regardless of why `target`
        // changed, so switching back never produces a visible jump - and
        // `sweepTime` (below) was never reset, so the sweep itself picks
        // back up exactly where it would have been, not from a fresh start.
        this.usingPointer = false;
      }
    }

    if (!this.usingPointer && this.config.autoSweepOnTouch) {
      this.sweepTime += deltaSeconds * this.config.sweepSpeed;
      // For "cursor", roam over the actual visible grid extent instead of
      // the sun's reach-scaled angular swing, so the wandering point
      // visibly crosses the grid rather than just changing angle.
      const reachX = isCursor
        ? this.halfWidthUnits * CURSOR_SWEEP_FRACTION * this.config.intensity
        : this.reach * this.config.intensity;
      const reachY = isCursor
        ? this.halfHeightUnits * CURSOR_SWEEP_FRACTION * this.config.intensity
        : this.reach * this.config.intensity * 0.7;
      const x =
        (Math.sin(this.sweepTime * SWEEP_X_FREQ_1 + this.sweepPhaseX) * 0.6 +
          Math.sin(this.sweepTime * SWEEP_X_FREQ_2 + this.sweepPhaseX * 1.7) * 0.4) *
        reachX;
      const y =
        (Math.sin(this.sweepTime * SWEEP_Y_FREQ_1 + this.sweepPhaseY) * 0.6 +
          Math.sin(this.sweepTime * SWEEP_Y_FREQ_2 + this.sweepPhaseY * 1.7) * 0.4) *
        reachY;
      this.target.set(x, y);
    }

    // Ease toward the target for a smooth, physical-feeling motion. Since
    // the auto-sweep target above is itself always in motion, this never
    // lets `current` fully catch up and sit still - it's continuously
    // chasing a moving point rather than converging on a fixed one.
    this.current.lerp(this.target, Math.min(1, deltaSeconds * this.config.easing));

    if (isCursor) {
      this._key.position.set(this.current.x, this.current.y, this.cursorHeightWorld);
      // Always points straight down at the point directly beneath it.
      this._key.target.position.set(this.current.x, this.current.y, 0);
    } else {
      this._key.position.set(this.current.x, this.current.y, this.lightDistance);
    }
  }

  dispose() {
    window.removeEventListener("pointermove", this.onWindowPointerMove);
    document.removeEventListener("pointerleave", this.onDocumentPointerLeave);
    this.scene.remove(this._key, this._key.target, this.ambient);
    this._key.shadow.map?.dispose();
  }
}

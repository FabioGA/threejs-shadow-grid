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

/** Incommensurate sine frequencies (rad/s) so the sweep path never repeats or comes to rest at a fixed point. */
const SWEEP_X_FREQ_1 = 0.21;
const SWEEP_X_FREQ_2 = 0.13;
const SWEEP_Y_FREQ_1 = 0.17;
const SWEEP_Y_FREQ_2 = 0.09;

/** Seconds "auto" mode follows a stationary pointer before resuming the auto-sweep. */
const AUTO_IDLE_RESUME_SECONDS = 3;

/** Onset-ramp duration (seconds, at sweepSpeed 1) after a pointer<->sweep switch - see modeTransitionSeconds(). */
const BASE_MODE_TRANSITION_SECONDS = 1.5;

/** Floor on sweepSpeed used for the transition duration, so a near-zero speed can't blow it up (or divide by zero). */
const MIN_SWEEP_SPEED_FOR_TRANSITION = 0.05;

/**
 * Owns the shadow-casting light plus an ambient fill light, driven by
 * either the pointer or (on touch/no-pointer devices) a continuous sine
 * drift so the shadow is always in motion and never repeats.
 *
 * `LightConfig.type`: "sun" is a DirectionalLight (parallel rays, one
 * shadow direction/length for every object). "cursor" is a SpotLight
 * positioned above the pointer/sweep point, so shadows vary by distance
 * to that point.
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
  /** Seconds since the last pointer movement while locked onto it in "auto" mode - see AUTO_IDLE_RESUME_SECONDS. */
  private idleSeconds = 0;
  /** Seconds since the last pointer<->auto-sweep switch; Infinity = no ramp pending - see setUsingPointer(). */
  private transitionElapsed = Infinity;
  private reach = 4.5;
  private lightDistance = 7;
  /** Shadow frustum half-extents, in world units - set by setShadowBounds(). */
  private halfWidthUnits = 5;
  private halfHeightUnits = 5;
  /** "cursor" light's configured height above the grid plane, in world units, before full-coverage flooring. */
  private cursorHeightConfigured = 7;
  /** "cursor" light's actual height, in world units, after flooring for full coverage - see applyCursorShadowBounds(). */
  private cursorHeightWorld = 7;
  /** World-unit distance from the grid plane to the backdrop, so shadow-camera far planes clear it - see setBackdropDistance(). Default matches the pre-shadowDistance hardcoded gap. */
  private backdropDistanceUnits = 1;
  // Listened on window/document, not the container: the container often
  // sits behind page content (z-index-wise), so a container-scoped listener
  // only fires while it's the topmost hit-test target - a small, gappy
  // sliver of the page. Computing inside/outside from the container's own
  // bounding rect instead gives the intended "follows the mouse anywhere
  // on the page" behavior.
  private onWindowPointerMove = (e: PointerEvent) => this.handleWindowPointerMove(e);
  private onDocumentPointerLeave = () => this.handleDocumentPointerLeave();
  // getBoundingClientRect() is a layout read - a high-frequency pointer
  // device can fire many pointermove events per rendered frame, and the
  // container's on-page position essentially never changes mid-frame, so
  // caching it for one frame (invalidated via rAF) removes the redundant
  // reads without changing any per-event behavior.
  private cachedContainerRect: DOMRect | null = null;
  private containerRectInvalidateRafId: number | null = null;

  constructor(scene: THREE.Scene, container: HTMLElement, config: Required<LightConfig>) {
    this.scene = scene;
    this.container = container;
    this.config = config;

    this._key = this.createLight(config.type);
    this.ambient = new THREE.AmbientLight(0xffffff, 1);

    // mode "auto" (default) starts sweeping, switches to pointer-follow on
    // the first pointermove, and drops back to sweeping when the pointer
    // leaves or idles - "pointer"/"sweep" pin one behavior regardless.
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
    if (config.mode === "sweep") this.setUsingPointer(false);
    if (config.mode === "pointer") this.setUsingPointer(true);
    this.applyStyle();
    // Re-derive shadow bounds from the new config right away - the caller
    // only calls setShadowBounds() again on an actual resize/rebuild.
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

  /** Updates the backdrop's world-unit distance from the grid plane and re-derives shadow bounds immediately, so the change takes effect without waiting for the next resize. */
  setBackdropDistance(distance: number) {
    this.backdropDistanceUnits = distance;
    this.setShadowBounds(this.halfWidthUnits, this.halfHeightUnits);
  }

  private applySunShadowBounds(key: THREE.DirectionalLight, halfWidthUnits: number, halfHeightUnits: number) {
    const cam = key.shadow.camera as THREE.OrthographicCamera;
    const margin = Math.max(halfWidthUnits, halfHeightUnits) * 0.35 + 1;
    cam.left = -halfWidthUnits - margin;
    cam.right = halfWidthUnits + margin;
    cam.top = halfHeightUnits + margin;
    cam.bottom = -halfHeightUnits - margin;
    cam.near = 0.1;
    cam.far = this.lightDistance * 3 + 20 + this.backdropDistanceUnits;
    cam.updateProjectionMatrix();
  }

  private applyCursorShadowBounds(key: THREE.SpotLight, halfWidthUnits: number, halfHeightUnits: number) {
    const diag = Math.hypot(halfWidthUnits, halfHeightUnits);
    // A spotlight's cone has a hard angle limit, so a very low configured
    // height can't always cover a large container corner-to-corner - floor
    // the effective height, recomputed fresh each time so growing the
    // container back out un-floors it again.
    const minHeightForFullCoverage = diag / Math.tan(MAX_CURSOR_ANGLE);
    this.cursorHeightWorld = Math.max(this.cursorHeightConfigured, minHeightForFullCoverage);

    const margin = 1.05;
    key.angle = Math.min(MAX_CURSOR_ANGLE, Math.atan2(diag, this.cursorHeightWorld) * margin);

    const cam = key.shadow.camera as THREE.PerspectiveCamera;
    // decay is 0 (see applyStyle()) so distance stays 0 too, meaning
    // camera.far never auto-tracks it - set both planes explicitly, and as
    // tight as possible: a perspective shadow map's depth precision is
    // front-loaded near its near plane, so a needlessly wide span starves
    // real objects of precision and shows up as shadow-acne artifacts.
    const clearance = 3; // headroom above the target, so tall objects aren't near-clipped
    const farthestPoint = Math.sqrt(diag * diag + (this.cursorHeightWorld + this.backdropDistanceUnits) ** 2);
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

  /**
   * Switches between "following the pointer" and "auto-sweeping" (a no-op if
   * `next` matches the current state). Restarts the onset ramp, so update()
   * eases `current`'s catch-up speed back up from a standstill over
   * modeTransitionSeconds() instead of resuming at full pace the instant the
   * source switches - see update()'s use of this ramp, and the per-frame
   * speed cap it feeds into for the "resuming the sweep" direction
   * specifically.
   */
  private setUsingPointer(next: boolean) {
    if (next !== this.usingPointer) {
      this.transitionElapsed = 0;
    }
    this.usingPointer = next;
  }

  /** Onset-ramp duration for a pointer<->sweep switch, scaled inversely by `sweepSpeed` (faster sweep, quicker ramp). */
  private modeTransitionSeconds(): number {
    return BASE_MODE_TRANSITION_SECONDS / Math.max(MIN_SWEEP_SPEED_FOR_TRANSITION, Math.abs(this.config.sweepSpeed));
  }

  private getContainerRect(): DOMRect {
    if (!this.cachedContainerRect) {
      this.cachedContainerRect = this.container.getBoundingClientRect();
      this.containerRectInvalidateRafId = requestAnimationFrame(() => {
        this.containerRectInvalidateRafId = null;
        this.cachedContainerRect = null;
      });
    }
    return this.cachedContainerRect;
  }

  private handleWindowPointerMove(e: PointerEvent) {
    if (this.config.mode === "sweep") return;

    this.idleSeconds = 0;

    const rect = this.getContainerRect();
    if (rect.width === 0 || rect.height === 0) return;

    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;

    if (this.config.mode === "pointer") {
      // Pinned: keep tracking anywhere on the page, never fall back to sweeping.
      this.setUsingPointer(true);
    } else if (inside) {
      this.setUsingPointer(true);
    } else {
      this.setUsingPointer(false);
      return;
    }

    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

    if (this.config.type === "cursor") {
      // Orthographic camera fixed at the origin, so mapping screen-normalized
      // coordinates to the world-space grid plane is exact - no raycasting needed.
      this.target.set(nx * this.halfWidthUnits, -ny * this.halfHeightUnits);
    } else {
      this.target.set(nx, -ny).multiplyScalar(this.reach * this.config.intensity);
    }
  }

  private handleDocumentPointerLeave() {
    if (this.config.mode === "pointer") return;
    this.setUsingPointer(false);
  }

  /** Advances the auto-sweep (if active) and eases the light toward its target. Call once per frame. */
  update(deltaSeconds: number) {
    const isCursor = this.config.type === "cursor";

    if (this.usingPointer && this.config.mode === "auto") {
      this.idleSeconds += deltaSeconds;
      if (this.idleSeconds >= AUTO_IDLE_RESUME_SECONDS) {
        // sweepTime was never reset, so the sweep resumes where it would've been, not from scratch.
        this.setUsingPointer(false);
      }
    }

    // Distance the sweep formula moves this frame - the "natural pace" that
    // setUsingPointer() below caps the catch-up speed to when resuming.
    let sweepStepDistance = 0;
    if (!this.usingPointer && this.config.autoSweepOnTouch) {
      // "cursor" roams the actual grid extent; "sun" swings by angle instead.
      const reachX = isCursor
        ? this.halfWidthUnits * CURSOR_SWEEP_FRACTION * this.config.intensity
        : this.reach * this.config.intensity;
      const reachY = isCursor
        ? this.halfHeightUnits * CURSOR_SWEEP_FRACTION * this.config.intensity
        : this.reach * this.config.intensity * 0.7;
      const sweepX = (t: number) =>
        (Math.sin(t * SWEEP_X_FREQ_1 + this.sweepPhaseX) * 0.6 +
          Math.sin(t * SWEEP_X_FREQ_2 + this.sweepPhaseX * 1.7) * 0.4) *
        reachX;
      const sweepY = (t: number) =>
        (Math.sin(t * SWEEP_Y_FREQ_1 + this.sweepPhaseY) * 0.6 +
          Math.sin(t * SWEEP_Y_FREQ_2 + this.sweepPhaseY * 1.7) * 0.4) *
        reachY;

      const prevSweepTime = this.sweepTime;
      this.sweepTime += deltaSeconds * this.config.sweepSpeed;
      const x = sweepX(this.sweepTime);
      const y = sweepY(this.sweepTime);
      sweepStepDistance = Math.hypot(x - sweepX(prevSweepTime), y - sweepY(prevSweepTime));
      this.target.set(x, y);
    }

    // Ramp 0 -> 1 over modeTransitionSeconds() after a mode switch, so the
    // catch-up eases in from a standstill instead of jumping to full pace.
    const transitionDuration = this.modeTransitionSeconds();
    this.transitionElapsed = Math.min(transitionDuration, this.transitionElapsed + deltaSeconds);
    const t = this.transitionElapsed / transitionDuration;
    const rampScale = t * t * (3 - 2 * t); // smoothstep

    const alpha = Math.min(1, deltaSeconds * this.config.easing * rampScale);
    if (!this.usingPointer && this.config.autoSweepOnTouch) {
      // Resuming the sweep: target may have jumped far (its clock kept
      // ticking while the pointer was followed) - cap the step at the
      // sweep's own pace so closing the gap never looks like a burst of speed.
      const dx = (this.target.x - this.current.x) * alpha;
      const dy = (this.target.y - this.current.y) * alpha;
      const stepLength = Math.hypot(dx, dy);
      const maxStep = sweepStepDistance * rampScale;
      const scale = stepLength > maxStep && stepLength > 0 ? maxStep / stepLength : 1;
      this.current.x += dx * scale;
      this.current.y += dy * scale;
    } else {
      // Ease toward the target for a smooth, physical-feeling motion.
      this.current.lerp(this.target, alpha);
    }

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
    if (this.containerRectInvalidateRafId !== null) cancelAnimationFrame(this.containerRectInvalidateRafId);
    this.scene.remove(this._key, this._key.target, this.ambient);
    this._key.shadow.map?.dispose();
  }
}

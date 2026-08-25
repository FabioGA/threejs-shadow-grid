import * as THREE from "three";
import { maxObjectSize, resolveConfig, resolveShadowDistance } from "./resolveConfig";
import { loadModels } from "./loaders";
import { GridBuilder, maxZJitterUnits } from "./grid";
import { LightRig } from "./light";
import {
  ADAPTIVE_PIXEL_RATIO_CHECK_INTERVAL_MS,
  ADAPTIVE_PIXEL_RATIO_EMA_ALPHA,
  ADAPTIVE_PIXEL_RATIO_FRAME_MS_STEP_DOWN,
  ADAPTIVE_PIXEL_RATIO_FRAME_MS_STEP_UP,
  ADAPTIVE_PIXEL_RATIO_MIN,
  ADAPTIVE_PIXEL_RATIO_STEP,
  PIXELS_PER_UNIT,
  RESIZE_REBUILD_DEBOUNCE_MS,
} from "./defaults";
import type { GridConfig, ResolvedGridConfig } from "./types";

/**
 * Mounts a full-bleed, infinitely-tiling grid of 3D objects into a
 * container element, filling it completely via ResizeObserver.
 *
 *   const grid = new ShadowGrid({ container: '#hero', models: '/duck.stl' });
 *   grid.destroy(); // later
 */
export class ShadowGrid {
  private config: ResolvedGridConfig;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private gridBuilder: GridBuilder;
  private lightRig: LightRig;
  private backdrop: THREE.Mesh | null = null;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private resizeRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private rafId: number | null = null;
  private lastTime = 0;
  private viewportWidthUnits = 1;
  private viewportHeightUnits = 1;
  private destroyed = false;
  private loadToken = 0;
  /** Largest boundingRadius across the currently loaded models (world units) - see applyShadowDistance(). */
  private maxModelRadiusUnits = 0;
  private containerPrevPosition: string | null = null;
  // The render loop only runs while both are true - no reason to spend GPU
  // time on a backgrounded tab or a container scrolled out of view, since
  // neither is visible to anyone anyway.
  private documentVisible = !document.hidden;
  private containerIntersecting = true;
  private onDocumentVisibilityChange = () => this.setDocumentVisible(!document.hidden);
  // Adaptive pixel ratio: the ratio actually applied to the renderer right
  // now, which can sit below `naturalPixelRatio()` (the maxPixelRatio-capped
  // devicePixelRatio ceiling) when frame time has been under pressure - see
  // updateAdaptivePixelRatio(). Set for real once `this.config` exists.
  private currentPixelRatio = 1;
  private frameTimeEma: number | null = null;
  private lastAdaptiveCheckTime = 0;

  constructor(config: GridConfig) {
    this.config = resolveConfig(config);
    this.container = this.config.container;
    this.currentPixelRatio = this.naturalPixelRatio();

    this.applyContainerStyles();

    this.canvas = document.createElement("canvas");
    this.applyCanvasStyles();
    this.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      // MSAA is most valuable at 1x device pixels, where hard instance
      // edges alias visibly; at >=2x effective pixel ratio the framebuffer
      // is already supersampled enough that MSAA's extra cost buys little.
      // `antialias` is a WebGL-context-creation-time option, so it's fixed
      // from the initial (capped) pixel ratio and can't react to a later
      // `maxPixelRatio` change via update().
      antialias: this.naturalPixelRatio() < 2,
      alpha: this.config.backgroundColor === "transparent",
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = this.config.shadows;
    this.renderer.shadowMap.type = this.shadowMapType();
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    if (this.config.backgroundColor !== "transparent") {
      this.scene.background = new THREE.Color(this.config.backgroundColor);
    }

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.gridBuilder = new GridBuilder(this.scene);

    this.lightRig = new LightRig(this.scene, this.container, this.config.light);

    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      this.config.backgroundColor === "transparent"
        ? new THREE.ShadowMaterial({ opacity: this.shadowOpacity() })
        : new THREE.MeshStandardMaterial({ color: this.config.backgroundColor, roughness: 1 })
    );
    this.backdrop.receiveShadow = true;
    this.backdrop.position.z = -1;
    this.scene.add(this.backdrop);

    this.resizeObserver = new ResizeObserver(() => this.handleResizeObserved());
    this.resizeObserver.observe(this.container);

    this.intersectionObserver = new IntersectionObserver(([entry]) => this.setIntersecting(entry.isIntersecting));
    this.intersectionObserver.observe(this.container);
    document.addEventListener("visibilitychange", this.onDocumentVisibilityChange);

    this.handleResize();
    this.loadAndBuild();
    this.startLoop();
  }

  /** Applies the minimal CSS needed for the canvas to fill the container edge-to-edge. */
  private applyContainerStyles() {
    const computed = window.getComputedStyle(this.container);
    if (computed.position === "static") {
      this.containerPrevPosition = this.container.style.position || "";
      this.container.style.position = "relative";
    }
  }

  private applyCanvasStyles() {
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      display: "block",
      pointerEvents: "none",
      zIndex: "0",
    } as Partial<CSSStyleDeclaration>);
  }

  /** The maxPixelRatio-capped devicePixelRatio ceiling - not necessarily what's currently applied, see currentPixelRatio. */
  private naturalPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.config.maxPixelRatio);
  }

  /**
   * `PCFSoftShadowMap`'s wider multi-tap blur is worth its extra per-fragment
   * cost mainly at "soft" style, where `shadow.radius` is already near its
   * max and needs the smoother filter to avoid banding; "medium"/"hard" sit
   * closer to `MIN_SHADOW_RADIUS`, where the cheaper `PCFShadowMap` filter
   * looks effectively the same.
   */
  private shadowMapType(): THREE.ShadowMapType {
    return this.config.light.style === "soft" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  }

  /** Cheap viewport recalculation only - canvas size, camera frustum, shadow bounds, backdrop scale. No grid rebuild. */
  private applyViewportMetrics() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    // Adaptive mode preserves any existing step-down across a resize (only
    // re-clamping to a ceiling that may itself have changed); non-adaptive
    // always snaps straight to the natural ceiling.
    this.currentPixelRatio = this.config.adaptivePixelRatio
      ? Math.min(this.currentPixelRatio, this.naturalPixelRatio())
      : this.naturalPixelRatio();
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.setSize(width, height, false);

    const halfWidthUnits = width / 2 / PIXELS_PER_UNIT;
    const halfHeightUnits = height / 2 / PIXELS_PER_UNIT;
    this.viewportWidthUnits = halfWidthUnits * 2;
    this.viewportHeightUnits = halfHeightUnits * 2;

    this.camera.left = -halfWidthUnits;
    this.camera.right = halfWidthUnits;
    this.camera.top = halfHeightUnits;
    this.camera.bottom = -halfHeightUnits;
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.camera.updateProjectionMatrix();

    this.lightRig.setShadowBounds(halfWidthUnits, halfHeightUnits);

    if (this.backdrop) {
      this.backdrop.scale.set(this.viewportWidthUnits + 2, this.viewportHeightUnits + 2, 1);
    }
  }

  /** Immediate: used for the initial mount and update() (a discrete config change, not an interactive-resize storm). */
  private handleResize() {
    this.applyViewportMetrics();
    this.rebuildGrid();
  }

  /**
   * ResizeObserver callback: viewport metrics update immediately on every
   * callback (cheap), but the expensive full grid rebuild is debounced so a
   * drag-resize or CSS transition doesn't rebuild every InstancedMesh on
   * every intermediate frame - `overscan` already covers the small resulting
   * edge gap while a rebuild is pending.
   */
  private handleResizeObserved() {
    this.applyViewportMetrics();
    if (this.resizeRebuildTimer !== null) clearTimeout(this.resizeRebuildTimer);
    this.resizeRebuildTimer = setTimeout(() => {
      this.resizeRebuildTimer = null;
      this.rebuildGrid();
    }, RESIZE_REBUILD_DEBOUNCE_MS);
  }

  private rebuildGrid() {
    this.gridBuilder.rebuild(this.viewportWidthUnits, this.viewportHeightUnits, this.config);
  }

  /**
   * Recomputes the backdrop's distance from the grid plane (from
   * `shadowDistance`, the deepest currently loaded model, and any
   * `arrangement: "random"` z-jitter) and applies it to both the backdrop
   * mesh and the light's shadow-camera far planes. Called after a model load
   * resolves, and on any config-only update (e.g. `shadowDistance` itself,
   * or - in "auto" mode - `cellSize`/`jitter`/`arrangement`).
   */
  private applyShadowDistance() {
    const zJitterUnits = maxZJitterUnits(this.config);
    const distance = resolveShadowDistance(this.config.shadowDistance, this.maxModelRadiusUnits, zJitterUnits);
    if (this.backdrop) this.backdrop.position.z = -distance;
    this.lightRig.setBackdropDistance(distance);
  }

  /**
   * Opacity for the transparent-mode shadow-only backdrop, derived from the
   * ambient light so shadow contrast stays consistent with how dark shadows
   * look in opaque/lit mode (lower ambient -> darker shadow).
   */
  private shadowOpacity(): number {
    return THREE.MathUtils.clamp(1 - this.config.light.ambient, 0, 1);
  }

  private async loadAndBuild() {
    const token = ++this.loadToken;
    const objectSizeUnits = maxObjectSize(this.config.objectSize) / PIXELS_PER_UNIT;
    try {
      const requests = this.config.models.map((source, i) => ({
        source,
        format: this.config.modelFormats[i],
        colorOverride: this.config.modelColorOverrides[i],
      }));
      const loaded = await loadModels(requests, objectSizeUnits);
      if (this.destroyed || token !== this.loadToken) return;
      this.gridBuilder.setModels(loaded);
      this.maxModelRadiusUnits = Math.max(0, ...loaded.map((model) => model.boundingRadius));
      this.applyShadowDistance();
      this.rebuildGrid();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  private startLoop() {
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (this.destroyed) return;
      // Raw (unclamped) delta doubles as the frame-time signal for adaptive
      // pixel ratio - `delta` below is clamped for animation smoothing only
      // (avoids a huge easing jump after a real gap), which would hide the
      // very slowness the adaptive check needs to see.
      const rawDeltaSeconds = (now - this.lastTime) / 1000;
      const delta = Math.min(0.1, rawDeltaSeconds);
      this.lastTime = now;
      this.lightRig.update(delta);
      this.renderer.render(this.scene, this.camera);
      this.updateAdaptivePixelRatio(now, rawDeltaSeconds);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Steps `currentPixelRatio` down under sustained frame-time pressure, and
   * back up toward `naturalPixelRatio()` once there's headroom - see the
   * ADAPTIVE_PIXEL_RATIO_* constants for the thresholds/hysteresis. Checked
   * at most once per ADAPTIVE_PIXEL_RATIO_CHECK_INTERVAL_MS so a single slow
   * frame (GC pause, tab-switch hiccup) can't trigger a step on its own -
   * only a sustained trend the EMA actually reflects.
   */
  private updateAdaptivePixelRatio(now: number, rawDeltaSeconds: number) {
    if (!this.config.adaptivePixelRatio) return;

    const frameMs = rawDeltaSeconds * 1000;
    this.frameTimeEma =
      this.frameTimeEma === null
        ? frameMs
        : this.frameTimeEma + (frameMs - this.frameTimeEma) * ADAPTIVE_PIXEL_RATIO_EMA_ALPHA;

    if (now - this.lastAdaptiveCheckTime < ADAPTIVE_PIXEL_RATIO_CHECK_INTERVAL_MS) return;
    this.lastAdaptiveCheckTime = now;

    const ceiling = this.naturalPixelRatio();
    if (
      this.frameTimeEma > ADAPTIVE_PIXEL_RATIO_FRAME_MS_STEP_DOWN &&
      this.currentPixelRatio > ADAPTIVE_PIXEL_RATIO_MIN
    ) {
      this.currentPixelRatio = Math.max(ADAPTIVE_PIXEL_RATIO_MIN, this.currentPixelRatio - ADAPTIVE_PIXEL_RATIO_STEP);
      this.renderer.setPixelRatio(this.currentPixelRatio);
    } else if (this.frameTimeEma < ADAPTIVE_PIXEL_RATIO_FRAME_MS_STEP_UP && this.currentPixelRatio < ceiling) {
      this.currentPixelRatio = Math.min(ceiling, this.currentPixelRatio + ADAPTIVE_PIXEL_RATIO_STEP);
      this.renderer.setPixelRatio(this.currentPixelRatio);
    }
  }

  private setDocumentVisible(visible: boolean) {
    this.documentVisible = visible;
    this.syncLoopRunning();
  }

  private setIntersecting(intersecting: boolean) {
    this.containerIntersecting = intersecting;
    this.syncLoopRunning();
  }

  /** Starts/stops the render loop to match document visibility + container intersection - nothing to render, nothing to pay for. */
  private syncLoopRunning() {
    if (this.destroyed) return;
    const shouldRun = this.documentVisible && this.containerIntersecting;
    if (shouldRun && this.rafId === null) {
      this.startLoop();
    } else if (!shouldRun && this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /** Partially updates the configuration. Reloads models only if `models`/`objectSize` changed. */
  update(patch: Partial<GridConfig>) {
    const modelsChanged = "models" in patch || "objectSize" in patch;
    const merged: GridConfig = {
      ...this.config,
      ...patch,
      container: this.config.container,
    } as GridConfig;
    this.config = resolveConfig(merged);

    if (this.config.backgroundColor !== "transparent") {
      this.scene.background = new THREE.Color(this.config.backgroundColor);
    } else {
      this.scene.background = null;
    }

    if (this.backdrop) {
      const wantsShadowMaterial = this.config.backgroundColor === "transparent";
      const hasShadowMaterial = this.backdrop.material instanceof THREE.ShadowMaterial;
      if (wantsShadowMaterial !== hasShadowMaterial) {
        (this.backdrop.material as THREE.Material).dispose();
        this.backdrop.material = wantsShadowMaterial
          ? new THREE.ShadowMaterial({ opacity: this.shadowOpacity() })
          : new THREE.MeshStandardMaterial({ color: this.config.backgroundColor, roughness: 1 });
      } else if (!wantsShadowMaterial) {
        (this.backdrop.material as THREE.MeshStandardMaterial).color.set(this.config.backgroundColor);
      } else {
        (this.backdrop.material as THREE.ShadowMaterial).opacity = this.shadowOpacity();
      }
    }

    this.lightRig.updateConfig(this.config.light);
    this.renderer.shadowMap.enabled = this.config.shadows;
    this.renderer.shadowMap.type = this.shadowMapType();

    if (modelsChanged) {
      this.loadAndBuild();
    } else {
      this.applyShadowDistance();
      this.handleResize();
    }
  }

  /** Stops rendering and releases all GPU/DOM resources. Safe to call once. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.resizeRebuildTimer !== null) clearTimeout(this.resizeRebuildTimer);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    document.removeEventListener("visibilitychange", this.onDocumentVisibilityChange);
    this.lightRig.dispose();
    this.gridBuilder.dispose();
    if (this.backdrop) {
      this.backdrop.geometry.dispose();
      (this.backdrop.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    if (this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
    if (this.containerPrevPosition !== null) {
      this.container.style.position = this.containerPrevPosition;
    }
  }
}

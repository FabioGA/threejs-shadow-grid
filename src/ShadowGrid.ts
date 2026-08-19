import * as THREE from "three";
import { resolveConfig } from "./resolveConfig";
import { loadModels } from "./loaders";
import { GridBuilder } from "./grid";
import { LightRig } from "./light";
import { PIXELS_PER_UNIT } from "./defaults";
import type { GridConfig, ResolvedGridConfig } from "./types";

/**
 * ShadowGrid mounts a full-bleed, infinitely-tiling grid of 3D objects
 * into a container element. It fills 100% of the container at all times
 * (via ResizeObserver), and the container's own CSS positioning (static,
 * relative, or a fixed full-viewport wrapper) determines whether it reads
 * as a normal in-flow background or a pinned full-page one - see the
 * README for both recipes.
 *
 * Usage:
 *   const grid = new ShadowGrid({ container: '#hero', models: '/duck.stl' });
 *   // later
 *   grid.destroy();
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
  private rafId: number | null = null;
  private lastTime = 0;
  private viewportWidthUnits = 1;
  private viewportHeightUnits = 1;
  private destroyed = false;
  private loadToken = 0;
  private containerPrevPosition: string | null = null;

  constructor(config: GridConfig) {
    this.config = resolveConfig(config);
    this.container = this.config.container;

    this.applyContainerStyles();

    this.canvas = document.createElement("canvas");
    this.applyCanvasStyles();
    this.container.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: this.config.backgroundColor === "transparent",
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = this.config.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    if (this.config.backgroundColor !== "transparent") {
      this.scene.background = new THREE.Color(this.config.backgroundColor);
    }

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    this.gridBuilder = new GridBuilder(this.scene);

    this.lightRig = new LightRig(this.container, this.config.light);
    this.scene.add(this.lightRig.key, this.lightRig.key.target, this.lightRig.ambient);

    if (this.config.backgroundColor !== "transparent") {
      this.backdrop = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ color: this.config.backgroundColor, roughness: 1 })
      );
      this.backdrop.receiveShadow = true;
      this.backdrop.position.z = -1;
      this.scene.add(this.backdrop);
    }

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

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

  private handleResize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.config.maxPixelRatio));
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

    this.rebuildGrid();
  }

  private rebuildGrid() {
    this.gridBuilder.rebuild(this.viewportWidthUnits, this.viewportHeightUnits, this.config);
  }

  private async loadAndBuild() {
    const token = ++this.loadToken;
    const objectSizeUnits = this.config.objectSize / PIXELS_PER_UNIT;
    try {
      const geometries = await loadModels(this.config.models, objectSizeUnits);
      if (this.destroyed || token !== this.loadToken) return;
      this.gridBuilder.setGeometries(geometries);
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
      const delta = Math.min(0.1, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.lightRig.update(delta);
      this.renderer.render(this.scene, this.camera);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
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
      if (this.backdrop) {
        (this.backdrop.material as THREE.MeshStandardMaterial).color.set(this.config.backgroundColor);
      }
    } else {
      this.scene.background = null;
    }

    this.lightRig.updateConfig(this.config.light);
    this.renderer.shadowMap.enabled = this.config.shadows;

    if (modelsChanged) {
      this.loadAndBuild();
    } else {
      this.handleResize();
    }
  }

  /** Stops rendering and releases all GPU/DOM resources. Safe to call once. */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
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

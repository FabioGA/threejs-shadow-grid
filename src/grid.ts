import * as THREE from "three";
import { OBJECT_MATERIAL_METALNESS, OBJECT_MATERIAL_ROUGHNESS, PIXELS_PER_UNIT } from "./defaults";
import { pickColor } from "./colors";
import { createRng } from "./random";
import type { ResolvedGridConfig } from "./types";

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

/**
 * Builds and maintains the InstancedMesh grid: given a set of loaded
 * geometries and the visible viewport size (in world units), it works out
 * how many rows/columns are needed to fully cover the viewport - plus a
 * small overscan margin - and places one object per cell.
 *
 * Rebuilding (on resize, or when config/geometries change) recreates the
 * InstancedMeshes sized exactly for the new cell count, which is what
 * makes the grid keep "filling all available space" as a container is
 * resized or the window is scrolled/resized.
 */
export class GridBuilder {
  private scene: THREE.Scene;
  private meshes: THREE.InstancedMesh[] = [];
  private materials: THREE.MeshStandardMaterial[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setGeometries(geometries: THREE.BufferGeometry[]) {
    this.geometries = geometries;
    // One shared material per model (per-instance color comes from the
    // InstancedMesh color buffer, so all instances of a model share one
    // material instance regardless of their individual color).
    this.materials.forEach((m) => m.dispose());
    this.materials = geometries.map(
      () =>
        new THREE.MeshStandardMaterial({
          roughness: OBJECT_MATERIAL_ROUGHNESS,
          metalness: OBJECT_MATERIAL_METALNESS,
        })
    );
  }

  /** viewportWidth/Height are in world units (Three.js units), not pixels. */
  rebuild(viewportWidthUnits: number, viewportHeightUnits: number, config: ResolvedGridConfig) {
    this.clearMeshes();
    if (this.geometries.length === 0) return;

    const cellSizeUnits = config.cellSize / PIXELS_PER_UNIT;
    const overscanCells = Math.max(0, Math.round(config.overscan * 4));

    const columns = Math.max(1, Math.ceil(viewportWidthUnits / cellSizeUnits) + overscanCells * 2);
    const rows = Math.max(1, Math.ceil(viewportHeightUnits / cellSizeUnits) + overscanCells * 2);
    const total = Math.min(columns * rows, config.maxInstances);

    const rng = createRng(config.seed ^ (columns * 73856093) ^ (rows * 19349663));

    // Pass 1: decide per-cell model index + color + transform jitter, and
    // tally how many instances each model needs.
    type CellPlan = {
      modelIndex: number;
      x: number;
      y: number;
      z: number;
      rotY: number;
      rotZ: number;
      scale: number;
      color: THREE.Color;
    };
    const plans: CellPlan[] = [];
    const countPerModel = new Array(this.geometries.length).fill(0);

    const originX = -((columns - 1) * cellSizeUnits) / 2;
    const originY = -((rows - 1) * cellSizeUnits) / 2;

    let cellIndex = 0;
    outer: for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (cellIndex >= total) break outer;
        cellIndex++;

        const modelIndex = Math.floor(rng() * this.geometries.length) % this.geometries.length;
        const jitter = config.arrangement === "random" ? config.jitter : 0;

        const jitterX = (rng() - 0.5) * jitter * cellSizeUnits;
        const jitterY = (rng() - 0.5) * jitter * cellSizeUnits;
        const jitterZ = (rng() - 0.5) * jitter * cellSizeUnits * 0.6;
        const rotY = config.arrangement === "random" ? rng() * Math.PI * 2 : 0;
        const rotZ = config.arrangement === "random" ? (rng() - 0.5) * jitter * 0.6 : 0;
        const scale = 1 + (config.arrangement === "random" ? (rng() - 0.5) * jitter * 0.5 : 0);

        plans.push({
          modelIndex,
          x: originX + col * cellSizeUnits + jitterX,
          y: originY + row * cellSizeUnits + jitterY,
          z: jitterZ,
          rotY,
          rotZ,
          scale,
          color: pickColor(config.colors, rng),
        });
        countPerModel[modelIndex]++;
      }
    }

    // Pass 2: create one InstancedMesh per model, sized to its instance count.
    const meshes = this.geometries.map((geometry, modelIndex) => {
      const count = countPerModel[modelIndex];
      const mesh = new THREE.InstancedMesh(geometry, this.materials[modelIndex], Math.max(count, 1));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = count;
      mesh.frustumCulled = false;
      return mesh;
    });

    const writeIndex = new Array(this.geometries.length).fill(0);
    for (const plan of plans) {
      const mesh = meshes[plan.modelIndex];
      const idx = writeIndex[plan.modelIndex]++;

      _position.set(plan.x, plan.y, plan.z);
      _euler.set(0, plan.rotY, plan.rotZ);
      _quaternion.setFromEuler(_euler);
      _scale.setScalar(plan.scale);
      _matrix.compose(_position, _quaternion, _scale);
      mesh.setMatrixAt(idx, _matrix);
      mesh.setColorAt(idx, plan.color);
    }

    meshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
    });

    this.meshes = meshes;
  }

  private clearMeshes() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes = [];
  }

  dispose() {
    this.clearMeshes();
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
  }
}

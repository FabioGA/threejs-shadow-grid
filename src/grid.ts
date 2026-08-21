import * as THREE from "three";
import {
  OBJECT_MATERIAL_CLEARCOAT_HARD,
  OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_HARD,
  OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_SOFT,
  OBJECT_MATERIAL_CLEARCOAT_SOFT,
  OBJECT_MATERIAL_METALNESS_HARD,
  OBJECT_MATERIAL_METALNESS_SOFT,
  OBJECT_MATERIAL_ROUGHNESS_HARD,
  OBJECT_MATERIAL_ROUGHNESS_SOFT,
  PIXELS_PER_UNIT,
} from "./defaults";
import { createColorPicker } from "./colors";
import { createModelIndexPicker } from "./models";
import { createRng } from "./random";
import { maxObjectSize } from "./resolveConfig";
import type { AxisRotation, ResolvedGridConfig } from "./types";

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

/** Resolves one axis of a rotation config to radians, drawing from `rng` when set to "random". */
function axisRotationRadians(axis: AxisRotation, rng: () => number): number {
  return axis === "random" ? rng() * Math.PI * 2 : (axis * Math.PI) / 180;
}

/** Fractional part of `value`, normalized into [0, 1) even for negative input. */
function fractionalPart(value: number): number {
  const f = value % 1;
  return f < 0 ? f + 1 : f;
}

/**
 * Builds and maintains the InstancedMesh grid: given loaded geometries and
 * the visible viewport size (world units), works out rows/columns needed
 * to cover it (plus overscan) and places one object per cell. Rebuilding
 * recreates the InstancedMeshes sized for the new cell count.
 */
export class GridBuilder {
  private scene: THREE.Scene;
  private meshes: THREE.InstancedMesh[] = [];
  private materials: THREE.MeshPhysicalMaterial[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setGeometries(geometries: THREE.BufferGeometry[]) {
    this.geometries.forEach((g) => g.dispose());
    this.geometries = geometries;
    // One shared material per model - per-instance color comes from the
    // InstancedMesh color buffer instead. Materials persist across
    // rebuilds (only geometry doesn't); roughness/metalness/clearcoat are
    // applied from `hardness` in rebuild() below.
    this.materials.forEach((m) => m.dispose());
    this.materials = geometries.map(() => new THREE.MeshPhysicalMaterial());
  }

  /** Applies the current `hardness` (0 = soft rubber, 1 = hard/glossy) to all materials in place. */
  private applyHardness(hardness: number) {
    const t = THREE.MathUtils.clamp(hardness, 0, 1);
    const roughness = THREE.MathUtils.lerp(OBJECT_MATERIAL_ROUGHNESS_SOFT, OBJECT_MATERIAL_ROUGHNESS_HARD, t);
    const metalness = THREE.MathUtils.lerp(OBJECT_MATERIAL_METALNESS_SOFT, OBJECT_MATERIAL_METALNESS_HARD, t);
    const clearcoat = THREE.MathUtils.lerp(OBJECT_MATERIAL_CLEARCOAT_SOFT, OBJECT_MATERIAL_CLEARCOAT_HARD, t);
    const clearcoatRoughness = THREE.MathUtils.lerp(
      OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_SOFT,
      OBJECT_MATERIAL_CLEARCOAT_ROUGHNESS_HARD,
      t
    );
    for (const material of this.materials) {
      material.roughness = roughness;
      material.metalness = metalness;
      material.clearcoat = clearcoat;
      material.clearcoatRoughness = clearcoatRoughness;
    }
  }

  /** viewportWidth/Height are in world units (Three.js units), not pixels. */
  rebuild(viewportWidthUnits: number, viewportHeightUnits: number, config: ResolvedGridConfig) {
    this.clearMeshes();
    if (this.geometries.length === 0) return;

    this.applyHardness(config.hardness);

    const cellSizeUnits = config.cellSize / PIXELS_PER_UNIT;
    const overscanCells = Math.max(0, Math.round(config.overscan * 4));
    // rowOffset can shift a row by nearly a full cell width; one extra
    // column on each side avoids exposing a gap at the edge.
    const rowOffsetMargin = config.rowOffset !== 0 ? 1 : 0;

    const columns = Math.max(1, Math.ceil(viewportWidthUnits / cellSizeUnits) + (overscanCells + rowOffsetMargin) * 2);
    const rows = Math.max(1, Math.ceil(viewportHeightUnits / cellSizeUnits) + overscanCells * 2);
    const total = Math.min(columns * rows, config.maxInstances);

    const rng = createRng(config.seed ^ (columns * 73856093) ^ (rows * 19349663));

    // Geometry is normalized (in loaders.ts) to the largest size objectSize
    // can resolve to; a { min, max } range then scales each instance down from that reference.
    const referenceSize = maxObjectSize(config.objectSize);

    // Built once per rebuild (not per cell), so weighted colors/models can
    // pre-partition the exact `total` instance count instead of an independent per-cell dice roll.
    const colorPicker = createColorPicker(config.colors, total, rng);
    const modelPicker = createModelIndexPicker(this.geometries.length, config.modelWeights, total, rng);

    // Pass 1: decide per-cell model index + color + transform jitter, and tally instances per model.
    type CellPlan = {
      modelIndex: number;
      x: number;
      y: number;
      z: number;
      rotX: number;
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
      const rowShiftUnits = fractionalPart(row * config.rowOffset) * cellSizeUnits;

      for (let col = 0; col < columns; col++) {
        if (cellIndex >= total) break outer;
        cellIndex++;

        const modelIndex = modelPicker();
        const jitter = config.arrangement === "random" ? config.jitter : 0;

        const jitterX = (rng() - 0.5) * jitter * cellSizeUnits;
        const jitterY = (rng() - 0.5) * jitter * cellSizeUnits;
        const jitterZ = (rng() - 0.5) * jitter * cellSizeUnits * 0.6;
        const rotX = axisRotationRadians(config.rotation.x, rng);
        const rotY = axisRotationRadians(config.rotation.y, rng);
        const rotZ = axisRotationRadians(config.rotation.z, rng);
        const scale =
          typeof config.objectSize === "number"
            ? 1
            : (config.objectSize.min + rng() * (config.objectSize.max - config.objectSize.min)) / referenceSize;

        plans.push({
          modelIndex,
          x: originX + col * cellSizeUnits + jitterX + rowShiftUnits,
          y: originY + row * cellSizeUnits + jitterY,
          z: jitterZ,
          rotX,
          rotY,
          rotZ,
          scale,
          color: colorPicker(),
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
      _euler.set(plan.rotX, plan.rotY, plan.rotZ);
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
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
  }
}

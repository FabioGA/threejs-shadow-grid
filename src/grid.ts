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
import type { LoadedModel } from "./loaders";
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

/** One geometry+material pairing that becomes its own `InstancedMesh`. `ownedByGrid` marks materials `GridBuilder` itself created (shared, hardness-controlled, disposed on teardown) vs. a GLTF's own baked material (hands off - see `applyHardness`/`dispose`). */
interface ResolvedPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  ownedByGrid: boolean;
}

/**
 * Builds and maintains the InstancedMesh grid: given loaded models and
 * the visible viewport size (world units), works out rows/columns needed
 * to cover it (plus overscan) and places one object per cell. A model may
 * back more than one InstancedMesh (a multi-material GLTF becomes one
 * InstancedMesh per part, all sharing the same per-cell transform).
 * Rebuilding recreates the InstancedMeshes sized for the new cell count.
 */
export class GridBuilder {
  private scene: THREE.Scene;
  private meshes: THREE.InstancedMesh[] = [];
  // Outer index = logical model index (parallel to config.models); inner = that model's parts (>1 for a multi-material GLTF).
  private models: ResolvedPart[][] = [];
  // Materials GridBuilder itself constructed (shared flat MeshPhysicalMaterials for STL / color-overridden models) -
  // the only materials it disposes or applies `hardness` to. A GLTF's baked materials are never added here.
  private ownedMaterials = new Set<THREE.MeshPhysicalMaterial>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setModels(loaded: LoadedModel[]) {
    for (const parts of this.models) for (const part of parts) part.geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();

    this.models = loaded.map(({ parts, colorOverride }) =>
      parts.map((part): ResolvedPart => {
        if (colorOverride) {
          const material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colorOverride) });
          this.ownedMaterials.add(material);
          return { geometry: part.geometry, material, ownedByGrid: true };
        }
        if (part.material) {
          // GLTF's own baked material - kept as-is, untouched by hardness/color.
          return { geometry: part.geometry, material: part.material, ownedByGrid: false };
        }
        // STL (or any part with no baked material) - shared blank material, colored per-instance below.
        const material = new THREE.MeshPhysicalMaterial();
        this.ownedMaterials.add(material);
        return { geometry: part.geometry, material, ownedByGrid: true };
      })
    );
  }

  /** Applies the current `hardness` (0 = soft rubber, 1 = hard/glossy) to GridBuilder-owned materials only - never a GLTF's baked material. */
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
    for (const material of this.ownedMaterials) {
      material.roughness = roughness;
      material.metalness = metalness;
      material.clearcoat = clearcoat;
      material.clearcoatRoughness = clearcoatRoughness;
    }
  }

  /** viewportWidth/Height are in world units (Three.js units), not pixels. */
  rebuild(viewportWidthUnits: number, viewportHeightUnits: number, config: ResolvedGridConfig) {
    this.clearMeshes();
    if (this.models.length === 0) return;

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
    const modelPicker = createModelIndexPicker(this.models.length, config.modelWeights, total, rng);

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
    const countPerModel = new Array(this.models.length).fill(0);

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

    // Pass 2: create one InstancedMesh per part (>1 per model for a
    // multi-material GLTF), sized to that model's instance count. All
    // part-meshes of the same model share the same per-cell transform
    // (written below from the one plan per cell), so a multi-part model
    // still renders/moves as one coherent object per grid cell.
    const meshesByModel: { mesh: THREE.InstancedMesh; ownedByGrid: boolean }[][] = this.models.map(
      (parts, modelIndex) => {
        const count = countPerModel[modelIndex];
        return parts.map(({ geometry, material, ownedByGrid }) => {
          const mesh = new THREE.InstancedMesh(geometry, material, Math.max(count, 1));
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.count = count;
          mesh.frustumCulled = false;
          return { mesh, ownedByGrid };
        });
      }
    );

    const writeIndex = new Array(this.models.length).fill(0);
    for (const plan of plans) {
      const idx = writeIndex[plan.modelIndex]++;

      _position.set(plan.x, plan.y, plan.z);
      _euler.set(plan.rotX, plan.rotY, plan.rotZ);
      _quaternion.setFromEuler(_euler);
      _scale.setScalar(plan.scale);
      _matrix.compose(_position, _quaternion, _scale);

      for (const { mesh, ownedByGrid } of meshesByModel[plan.modelIndex]) {
        mesh.setMatrixAt(idx, _matrix);
        // Only GridBuilder-owned (flat/shared) materials read per-instance
        // color; a GLTF's baked material renders as authored.
        if (ownedByGrid) mesh.setColorAt(idx, plan.color);
      }
    }

    const meshes = meshesByModel.flat().map(({ mesh }) => mesh);
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
    for (const parts of this.models) for (const part of parts) part.geometry.dispose();
    // GLTF-baked materials/textures are intentionally not disposed here -
    // they're owned by loaders.ts's raw-parts cache (same non-disposal
    // trade-off already made for STL's cached raw geometry), not by
    // GridBuilder. Only materials GridBuilder itself created are disposed.
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.clear();
    this.models = [];
  }
}

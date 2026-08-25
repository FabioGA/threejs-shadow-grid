import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { GridBuilder } from "../grid";
import { DEFAULT_LIGHT } from "../defaults";
import type { LoadedModel } from "../loaders";
import type { ResolvedGridConfig } from "../types";

function buildConfig(overrides: Partial<ResolvedGridConfig> = {}): ResolvedGridConfig {
  return {
    models: ["/a.stl"],
    container: {} as HTMLElement,
    cellSize: 100, // PIXELS_PER_UNIT is 100, so this is exactly 1 world unit per cell
    objectSize: 80,
    shadowDistance: "auto",
    arrangement: "grid",
    jitter: 0.4,
    rowOffset: 0,
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: "XYZ",
    overscan: 0,
    maxInstances: 4000,
    modelWeights: null,
    modelColorOverrides: [null],
    modelFormats: [null],
    colors: "#ffffff",
    hardness: 0,
    backgroundColor: "#000000",
    matchBackground: false,
    seed: 1337,
    light: DEFAULT_LIGHT,
    maxPixelRatio: 2,
    shadows: true,
    adaptivePixelRatio: true,
    ...overrides,
  };
}

function positionAt(mesh: THREE.InstancedMesh, index: number): THREE.Vector3 {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return position;
}

function quaternionAt(mesh: THREE.InstancedMesh, index: number): THREE.Quaternion {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return quaternion;
}

/** A single-part model with no baked material - the STL shape (or GLTF+color-override, once GridBuilder substitutes a flat material). */
function stlModel(geometry: THREE.BufferGeometry): LoadedModel {
  return { parts: [{ geometry, material: null }], colorOverride: null, boundingRadius: 1 };
}

/** A single-part model carrying its own baked material - the plain-GLTF shape. */
function gltfModel(geometry: THREE.BufferGeometry, material: THREE.Material): LoadedModel {
  return { parts: [{ geometry, material }], colorOverride: null, boundingRadius: 1 };
}

describe("GridBuilder", () => {
  it("fills the viewport with exactly columns * rows instances for a plain grid", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    // viewport is exactly 4x2 cells, no overscan -> 4 columns, 2 rows, 8 total.
    builder.rebuild(4, 2, buildConfig());

    const totalInstances = scene.children
      .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
      .reduce((sum, mesh) => sum + mesh.count, 0);
    expect(totalInstances).toBe(8);
  });

  it("caps total instances at maxInstances", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    builder.rebuild(4, 2, buildConfig({ maxInstances: 5 }));

    const mesh = scene.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(5);
  });

  it("picks from all models roughly evenly when modelWeights is null (unweighted)", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1)), stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    builder.rebuild(
      20,
      20,
      buildConfig({ modelWeights: null, modelColorOverrides: [null, null], modelFormats: [null, null] })
    );

    const meshes = scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
    expect(meshes.length).toBe(2);
    expect(meshes[0].count + meshes[1].count).toBe(400);
    expect(meshes[0].count).toBeGreaterThan(0);
    expect(meshes[1].count).toBeGreaterThan(0);
  });

  it("partitions instances across models proportionally to modelWeights", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1)), stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    // 20x20 viewport -> 400 total instances, split ~75/25 by weight.
    builder.rebuild(
      20,
      20,
      buildConfig({ modelWeights: [3, 1], modelColorOverrides: [null, null], modelFormats: [null, null] })
    );

    const meshes = scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
    expect(meshes[0].count + meshes[1].count).toBe(400);
    expect(meshes[0].count).toBeCloseTo(300, -1);
    expect(meshes[1].count).toBeCloseTo(100, -1);
  });

  it("shifts alternating rows by rowOffset, as a fraction of cellSize", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    // 4x2 viewport, rowOffset 0.5 -> row 1 shifts half a cell right. A non-zero
    // rowOffset also adds one extra margin column on each side (to avoid a gap
    // at the shifted edge), so the grid is actually 6 columns wide, not 4.
    builder.rebuild(4, 2, buildConfig({ rowOffset: 0.5 }));

    const mesh = scene.children[0] as THREE.InstancedMesh;
    const row0Col0 = positionAt(mesh, 0); // first cell written, row 0
    const row1Col0 = positionAt(mesh, 6); // first cell of row 1 (6 columns per row)

    expect(row1Col0.x - row0Col0.x).toBeCloseTo(0.5, 10);
    expect(row0Col0.z).toBe(0); // arrangement "grid" forces jitter (and so z-jitter) to 0
  });

  it("composes rotation.x/y/z per rotationOrder, matching THREE.Euler directly", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    const rotation = { x: 10, y: 20, z: 30 };
    builder.rebuild(1, 1, buildConfig({ rotation, rotationOrder: "ZYX" }));

    const mesh = scene.children[0] as THREE.InstancedMesh;
    const actual = quaternionAt(mesh, 0);
    const expected = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (rotation.x * Math.PI) / 180,
        (rotation.y * Math.PI) / 180,
        (rotation.z * Math.PI) / 180,
        "ZYX"
      )
    );

    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
    expect(actual.w).toBeCloseTo(expected.w, 6);
  });

  it("removes and disposes previous meshes on rebuild", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    builder.rebuild(4, 2, buildConfig());
    expect(scene.children.length).toBe(1);

    builder.rebuild(2, 2, buildConfig());
    expect(scene.children.length).toBe(1); // old mesh removed, not accumulated
  });

  it("dispose() removes all meshes and disposes materials and geometries", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const geometryDispose = vi.spyOn(geometry, "dispose");
    builder.setModels([stlModel(geometry)]);
    builder.rebuild(4, 2, buildConfig());

    builder.dispose();

    expect(scene.children.length).toBe(0);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it("disposes previously-set geometries when setModels is called again", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    const oldGeometry = new THREE.BoxGeometry(1, 1, 1);
    const oldDispose = vi.spyOn(oldGeometry, "dispose");
    builder.setModels([stlModel(oldGeometry)]);

    builder.setModels([stlModel(new THREE.BoxGeometry(1, 1, 1))]);

    expect(oldDispose).toHaveBeenCalledTimes(1);
  });

  it("does nothing when rebuilt with no models set", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.rebuild(4, 2, buildConfig());
    expect(scene.children.length).toBe(0);
  });

  describe("GLTF multi-material models", () => {
    it("creates one InstancedMesh per part, sharing the same per-cell transform", () => {
      const scene = new THREE.Scene();
      const builder = new GridBuilder(scene);
      const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
      const wheelGeometry = new THREE.SphereGeometry(0.5);
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#ff0000" });
      const wheelMaterial = new THREE.MeshStandardMaterial({ color: "#000000" });
      builder.setModels([
        {
          parts: [
            { geometry: bodyGeometry, material: bodyMaterial },
            { geometry: wheelGeometry, material: wheelMaterial },
          ],
          colorOverride: null,
          boundingRadius: 1,
        },
      ]);

      builder.rebuild(4, 2, buildConfig());

      const meshes = scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
      expect(meshes.length).toBe(2);
      expect(meshes[0].count).toBe(meshes[1].count);
      expect(positionAt(meshes[0], 3)).toEqual(positionAt(meshes[1], 3));
    });

    it("does not call setColorAt on a part with a baked (non-overridden) GLTF material", () => {
      const scene = new THREE.Scene();
      const builder = new GridBuilder(scene);
      const material = new THREE.MeshStandardMaterial({ color: "#ff0000" });
      builder.setModels([gltfModel(new THREE.BoxGeometry(1, 1, 1), material)]);

      builder.rebuild(4, 2, buildConfig());

      const mesh = scene.children[0] as THREE.InstancedMesh;
      expect(mesh.material).toBe(material);
      expect(mesh.instanceColor).toBeNull();
    });

    it("substitutes a flat owned material (and calls setColorAt) when colorOverride is set", () => {
      const scene = new THREE.Scene();
      const builder = new GridBuilder(scene);
      const bakedMaterial = new THREE.MeshStandardMaterial({ color: "#ff0000" });
      builder.setModels([
        {
          parts: [{ geometry: new THREE.BoxGeometry(1, 1, 1), material: bakedMaterial }],
          colorOverride: "#00ff00",
          boundingRadius: 1,
        },
      ]);

      builder.rebuild(4, 2, buildConfig());

      const mesh = scene.children[0] as THREE.InstancedMesh;
      expect(mesh.material).not.toBe(bakedMaterial);
      expect(mesh.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(mesh.instanceColor).not.toBeNull();
    });

    it("does not mutate a baked material's roughness/metalness/clearcoat via hardness", () => {
      const scene = new THREE.Scene();
      const builder = new GridBuilder(scene);
      const material = new THREE.MeshStandardMaterial({ color: "#ff0000" });
      const originalRoughness = material.roughness;
      builder.setModels([gltfModel(new THREE.BoxGeometry(1, 1, 1), material)]);

      builder.rebuild(4, 2, buildConfig({ hardness: 1 }));

      expect(material.roughness).toBe(originalRoughness);
    });

    it("renders no InstancedMesh for a zero-part (failed-to-load) model, without affecting other models", () => {
      const scene = new THREE.Scene();
      const builder = new GridBuilder(scene);
      builder.setModels([
        stlModel(new THREE.BoxGeometry(1, 1, 1)),
        { parts: [], colorOverride: null, boundingRadius: 0 }, // stands in for a model that failed to load
      ]);

      builder.rebuild(
        20,
        20,
        buildConfig({ modelWeights: null, modelColorOverrides: [null, null], modelFormats: [null, "gltf"] })
      );

      const meshes = scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
      expect(meshes.length).toBe(1); // only the working model produced a mesh
      expect(meshes[0].count).toBeGreaterThan(0);
    });

    it("does not dispose a baked material on dispose(), only GridBuilder-owned ones", () => {
      const scene = new THREE.Scene();
      const builder = new GridBuilder(scene);
      const bakedMaterial = new THREE.MeshStandardMaterial({ color: "#ff0000" });
      const bakedDispose = vi.spyOn(bakedMaterial, "dispose");
      builder.setModels([
        stlModel(new THREE.BoxGeometry(1, 1, 1)),
        gltfModel(new THREE.BoxGeometry(1, 1, 1), bakedMaterial),
      ]);
      builder.rebuild(4, 2, buildConfig({ modelColorOverrides: [null, null], modelFormats: [null, "gltf"] }));

      builder.dispose();

      expect(bakedDispose).not.toHaveBeenCalled();
    });
  });
});

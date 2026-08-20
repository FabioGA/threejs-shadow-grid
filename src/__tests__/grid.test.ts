import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { GridBuilder } from "../grid";
import { DEFAULT_LIGHT } from "../defaults";
import type { ResolvedGridConfig } from "../types";

function buildConfig(overrides: Partial<ResolvedGridConfig> = {}): ResolvedGridConfig {
  return {
    models: ["/a.stl"],
    container: {} as HTMLElement,
    cellSize: 100, // PIXELS_PER_UNIT is 100, so this is exactly 1 world unit per cell
    objectSize: 80,
    arrangement: "grid",
    jitter: 0.4,
    rowOffset: 0,
    rotation: { x: 0, y: 0, z: 0 },
    overscan: 0,
    maxInstances: 4000,
    modelWeights: null,
    colors: "#ffffff",
    hardness: 0,
    backgroundColor: "#000000",
    matchBackground: false,
    seed: 1337,
    light: DEFAULT_LIGHT,
    maxPixelRatio: 2,
    shadows: true,
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

describe("GridBuilder", () => {
  it("fills the viewport with exactly columns * rows instances for a plain grid", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1)]);

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
    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1)]);

    builder.rebuild(4, 2, buildConfig({ maxInstances: 5 }));

    const mesh = scene.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(5);
  });

  it("picks from all models roughly evenly when modelWeights is null (unweighted)", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1, 1, 1)]);

    builder.rebuild(20, 20, buildConfig({ modelWeights: null }));

    const meshes = scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
    expect(meshes.length).toBe(2);
    expect(meshes[0].count + meshes[1].count).toBe(400);
    expect(meshes[0].count).toBeGreaterThan(0);
    expect(meshes[1].count).toBeGreaterThan(0);
  });

  it("partitions instances across models proportionally to modelWeights", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1, 1, 1)]);

    // 20x20 viewport -> 400 total instances, split ~75/25 by weight.
    builder.rebuild(20, 20, buildConfig({ modelWeights: [3, 1] }));

    const meshes = scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
    expect(meshes[0].count + meshes[1].count).toBe(400);
    expect(meshes[0].count).toBeCloseTo(300, -1);
    expect(meshes[1].count).toBeCloseTo(100, -1);
  });

  it("shifts alternating rows by rowOffset, as a fraction of cellSize", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1)]);

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

  it("removes and disposes previous meshes on rebuild", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1)]);

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
    builder.setGeometries([geometry]);
    builder.rebuild(4, 2, buildConfig());

    builder.dispose();

    expect(scene.children.length).toBe(0);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
  });

  it("disposes previously-set geometries when setGeometries is called again", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    const oldGeometry = new THREE.BoxGeometry(1, 1, 1);
    const oldDispose = vi.spyOn(oldGeometry, "dispose");
    builder.setGeometries([oldGeometry]);

    builder.setGeometries([new THREE.BoxGeometry(1, 1, 1)]);

    expect(oldDispose).toHaveBeenCalledTimes(1);
  });

  it("does nothing when rebuilt with no geometries set", () => {
    const scene = new THREE.Scene();
    const builder = new GridBuilder(scene);
    builder.rebuild(4, 2, buildConfig());
    expect(scene.children.length).toBe(0);
  });
});

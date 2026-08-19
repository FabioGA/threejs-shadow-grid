import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { describe, expect, it, vi } from "vitest";
import { loadModels } from "../loaders";

/** Builds a minimal binary STL ArrayBuffer containing a single triangle. */
function makeBinaryStl(v1: [number, number, number], v2: [number, number, number], v3: [number, number, number]) {
  const buffer = new ArrayBuffer(84 + 50);
  const view = new DataView(buffer);
  view.setUint32(80, 1, true); // 1 triangle

  let offset = 84;
  const writeVec3 = (v: [number, number, number]) => {
    view.setFloat32(offset, v[0], true);
    view.setFloat32(offset + 4, v[1], true);
    view.setFloat32(offset + 8, v[2], true);
    offset += 12;
  };
  writeVec3([0, 0, 1]); // normal (unused by our normalization)
  writeVec3(v1);
  writeVec3(v2);
  writeVec3(v3);
  view.setUint16(offset, 0, true); // attribute byte count

  return buffer;
}

describe("loadModels", () => {
  it("centers and scales the loaded geometry to the target size", async () => {
    const buffer = makeBinaryStl([0, 0, 0], [2, 0, 0], [0, 2, 0]);
    const [geometry] = await loadModels([buffer], 10);

    const box = geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(10, 4);
    expect(center.length()).toBeCloseTo(0, 4);
  });

  it("does not cache ArrayBuffer sources by reference (avoids retaining every uploaded model forever)", async () => {
    const parseSpy = vi.spyOn(STLLoader.prototype, "parse");
    const buffer = makeBinaryStl([0, 0, 0], [2, 0, 0], [0, 2, 0]);

    await loadModels([buffer], 10);
    await loadModels([buffer], 10); // same reference, second call

    expect(parseSpy).toHaveBeenCalledTimes(2);
    parseSpy.mockRestore();
  });

  it("normalizes each call independently, even for the same source with a different target size", async () => {
    const buffer = makeBinaryStl([0, 0, 0], [4, 0, 0], [0, 4, 0]);
    const [small] = await loadModels([buffer], 5);
    const [large] = await loadModels([buffer], 20);

    const sizeOf = (geometry: THREE.BufferGeometry) => {
      const size = new THREE.Vector3();
      geometry.boundingBox!.getSize(size);
      return Math.max(size.x, size.y, size.z);
    };

    expect(sizeOf(small)).toBeCloseTo(5, 4);
    expect(sizeOf(large)).toBeCloseTo(20, 4);
  });
});

// @vitest-environment jsdom
// GLTFExporter's binary (GLB) mode uses FileReader to turn a Blob into an
// ArrayBuffer - only needed to build in-memory GLTF test fixtures below, not
// by the library's own loading path (which never exports).
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectModelFormat, loadModels, type ModelRequest } from "../loaders";
import type { ModelSource } from "../types";

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

/** Exports a THREE.Object3D to a GLB (binary glTF) ArrayBuffer, for building GLTF test fixtures without committing binary files. */
async function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(object, (result) => resolve(result as ArrayBuffer), reject, { binary: true });
  });
}

function stlRequest(source: ModelSource, overrides: Partial<ModelRequest> = {}): ModelRequest {
  return { source, format: null, colorOverride: null, ...overrides };
}

// Belt-and-suspenders: restores any vi.spyOn left dangling by a test that
// throws before its own explicit mockRestore() (e.g. a bad assertion) - a
// leftover console.error spy would otherwise double-count in the next test.
afterEach(() => {
  vi.restoreAllMocks();
});

describe("detectModelFormat", () => {
  it("detects stl/gltf/glb from a URL extension, case-insensitively", () => {
    expect(detectModelFormat("/models/duck.stl", null)).toBe("stl");
    expect(detectModelFormat("/models/DUCK.STL", null)).toBe("stl");
    expect(detectModelFormat("/models/duck.glb", null)).toBe("gltf");
    expect(detectModelFormat("/models/duck.gltf", null)).toBe("gltf");
    expect(detectModelFormat("/models/DUCK.GLB", null)).toBe("gltf");
  });

  it("strips query strings/fragments before checking the extension", () => {
    expect(detectModelFormat("/models/duck.glb?v=2", null)).toBe("gltf");
    expect(detectModelFormat("/models/duck.stl#frag", null)).toBe("stl");
  });

  it("falls back to stl for an unrecognized extension", () => {
    expect(detectModelFormat("/models/duck", null)).toBe("stl");
  });

  it("detects a GLB ArrayBuffer via its magic number", () => {
    const buffer = new ArrayBuffer(12);
    new DataView(buffer).setUint32(0, 0x46546c67, true); // "glTF"
    expect(detectModelFormat(buffer, null)).toBe("gltf");
  });

  it("falls back to stl for a non-GLB ArrayBuffer", () => {
    const buffer = makeBinaryStl([0, 0, 0], [1, 0, 0], [0, 1, 0]);
    expect(detectModelFormat(buffer, null)).toBe("stl");
  });

  it("lets an explicit format override auto-detection", () => {
    expect(detectModelFormat("/models/duck.stl", "gltf")).toBe("gltf");
    expect(detectModelFormat(new ArrayBuffer(0), "stl")).toBe("stl");
  });
});

describe("loadModels - STL", () => {
  it("centers and scales the loaded geometry to the target size", async () => {
    const buffer = makeBinaryStl([0, 0, 0], [2, 0, 0], [0, 2, 0]);
    const [{ parts, colorOverride }] = await loadModels([stlRequest(buffer)], 10);

    expect(parts).toHaveLength(1);
    expect(parts[0].material).toBeNull();
    expect(colorOverride).toBeNull();

    const box = parts[0].geometry.boundingBox!;
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(10, 4);
    expect(center.length()).toBeCloseTo(0, 4);
  });

  it("computes boundingRadius as half the normalized bounding box's diagonal", async () => {
    const buffer = makeBinaryStl([0, 0, 0], [6, 0, 0], [0, 8, 0]);
    const [{ parts, boundingRadius }] = await loadModels([stlRequest(buffer)], 10);

    const size = new THREE.Vector3();
    parts[0].geometry.boundingBox!.getSize(size);
    expect(boundingRadius).toBeCloseTo(size.length() / 2, 4);
  });

  it("does not cache ArrayBuffer sources by reference (avoids retaining every uploaded model forever)", async () => {
    const parseSpy = vi.spyOn(STLLoader.prototype, "parse");
    const buffer = makeBinaryStl([0, 0, 0], [2, 0, 0], [0, 2, 0]);

    await loadModels([stlRequest(buffer)], 10);
    await loadModels([stlRequest(buffer)], 10); // same reference, second call

    expect(parseSpy).toHaveBeenCalledTimes(2);
    parseSpy.mockRestore();
  });

  it("normalizes each call independently, even for the same source with a different target size", async () => {
    const buffer = makeBinaryStl([0, 0, 0], [4, 0, 0], [0, 4, 0]);
    const [{ parts: small }] = await loadModels([stlRequest(buffer)], 5);
    const [{ parts: large }] = await loadModels([stlRequest(buffer)], 20);

    const sizeOf = (geometry: THREE.BufferGeometry) => {
      const size = new THREE.Vector3();
      geometry.boundingBox!.getSize(size);
      return Math.max(size.x, size.y, size.z);
    };

    expect(sizeOf(small[0].geometry)).toBeCloseTo(5, 4);
    expect(sizeOf(large[0].geometry)).toBeCloseTo(20, 4);
  });

  it("passes colorOverride through unchanged", async () => {
    const buffer = makeBinaryStl([0, 0, 0], [2, 0, 0], [0, 2, 0]);
    const [{ colorOverride }] = await loadModels([stlRequest(buffer, { colorOverride: "#ff00ff" })], 10);
    expect(colorOverride).toBe("#ff00ff");
  });
});

describe("loadModels - GLTF", () => {
  it("extracts one part per mesh, preserving each mesh's baked material", async () => {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial({ color: 0x0000ff }));
    wheel.position.set(3, 0, 0);
    const scene = new THREE.Group();
    scene.add(body, wheel);

    const glb = await exportGlb(scene);
    const [{ parts, colorOverride }] = await loadModels([stlRequest(glb, { format: "gltf" })], 10);

    expect(parts).toHaveLength(2);
    expect(colorOverride).toBeNull();
    for (const part of parts) {
      expect(part.material).not.toBeNull();
      expect(part.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
  });

  it("normalizes multi-part models by their combined bounding box, keeping parts spatially coherent", async () => {
    // Two 1-unit cubes 10 units apart on X - combined bbox is 11 units wide.
    const left = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    const right = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    right.position.set(10, 0, 0);
    const scene = new THREE.Group();
    scene.add(left, right);

    const glb = await exportGlb(scene);
    const [{ parts, boundingRadius }] = await loadModels([stlRequest(glb, { format: "gltf" })], 11);

    const combinedBox = new THREE.Box3();
    for (const part of parts) {
      part.geometry.computeBoundingBox();
      combinedBox.union(part.geometry.boundingBox!);
    }
    const size = new THREE.Vector3();
    combinedBox.getSize(size);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(11, 3);

    // boundingRadius circumscribes the *combined* model (both parts), not just one part's own local extent.
    expect(boundingRadius).toBeCloseTo(size.length() / 2, 3);

    // The two parts' centers should still be ~10 (scale 1:1 here since target size == source size).
    const centerOf = (geometry: THREE.BufferGeometry) => {
      geometry.computeBoundingBox();
      const c = new THREE.Vector3();
      geometry.boundingBox!.getCenter(c);
      return c;
    };
    const distance = centerOf(parts[0].geometry).distanceTo(centerOf(parts[1].geometry));
    expect(distance).toBeCloseTo(10, 3);
  });

  it("logs and resolves to zero parts (rather than rejecting) for a GLTF with no renderable meshes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const scene = new THREE.Group();
    scene.add(new THREE.Object3D()); // no meshes, just an empty node
    const glb = await exportGlb(scene);

    const [{ parts, boundingRadius }] = await loadModels([stlRequest(glb, { format: "gltf" })], 10);

    expect(parts).toEqual([]);
    expect(boundingRadius).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedError = errorSpy.mock.calls[0][0];
    expect(loggedError).toBeInstanceOf(Error);
    expect((loggedError as Error).message).toMatch(/no renderable meshes/);
    errorSpy.mockRestore();
  });

  it("isolates one model's load failure - other requests in the same call still resolve", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const goodBuffer = makeBinaryStl([0, 0, 0], [2, 0, 0], [0, 2, 0]);
    const emptyScene = new THREE.Group();
    emptyScene.add(new THREE.Object3D());
    const badGlb = await exportGlb(emptyScene);

    const [good, bad] = await loadModels([stlRequest(goodBuffer), stlRequest(badGlb, { format: "gltf" })], 10);

    expect(good.parts).toHaveLength(1);
    expect(bad.parts).toEqual([]);
    expect(bad.boundingRadius).toBe(0);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

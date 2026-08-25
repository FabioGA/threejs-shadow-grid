import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelFormat, ModelSource } from "./types";

const stlLoader = new STLLoader();
const gltfLoader = new GLTFLoader();

/** One renderable piece of a loaded model: its geometry, and either a baked material (GLTF) or `null` (needs a shared flat material - see `GridBuilder`). */
export interface ModelPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | null;
}

/** One fully loaded+normalized model, ready for `GridBuilder.setModels()`. */
export interface LoadedModel {
  parts: ModelPart[];
  colorOverride: string | null;
  /**
   * Radius (world units, post-normalization) of the sphere that circumscribes
   * this model regardless of orientation - i.e. how far its geometry can
   * reach from its own center under any `rotation`. Used by `ShadowGrid` to
   * size `shadowDistance: "auto"` so the backdrop always clears it. `0` for a
   * model that failed to load.
   */
  boundingRadius: number;
}

/** One requested model to load. */
export interface ModelRequest {
  source: ModelSource;
  format: ModelFormat | null;
  colorOverride: string | null;
}

/**
 * Detects whether `source` is STL or GLTF/GLB. URL strings are sniffed by
 * extension; ArrayBuffers are sniffed via GLB's magic number ("glTF" as the
 * first 4 bytes) - a plain-JSON .gltf ArrayBuffer has no reliable magic
 * number, so `explicit` (from `WeightedModel.format`) is the escape hatch
 * for that one case. Falls back to "stl" for anything unrecognized,
 * preserving pre-GLTF-support behavior for existing configs.
 */
export function detectModelFormat(source: ModelSource, explicit: ModelFormat | null): ModelFormat {
  if (explicit) return explicit;

  if (typeof source === "string") {
    const path = source.split(/[?#]/)[0].toLowerCase();
    if (path.endsWith(".glb") || path.endsWith(".gltf")) return "gltf";
    return "stl";
  }

  if (source.byteLength >= 4 && new DataView(source).getUint32(0, true) === 0x46546c67) return "gltf";
  return "stl";
}

/** Loads a single STL source (URL string or already-fetched ArrayBuffer) into a BufferGeometry. */
async function loadStl(source: ModelSource): Promise<THREE.BufferGeometry> {
  if (typeof source === "string") {
    return new Promise((resolve, reject) => {
      stlLoader.load(
        source,
        (geometry) => resolve(geometry),
        undefined,
        (err) => reject(new Error(`[threejs-shadow-grid] failed to load STL "${source}": ${err}`))
      );
    });
  }
  return stlLoader.parse(source);
}

/** Loads a single GLTF/GLB source (URL string or already-fetched ArrayBuffer) into its scene graph. */
async function loadGltfScene(source: ModelSource): Promise<THREE.Group> {
  if (typeof source === "string") {
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        source,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(new Error(`[threejs-shadow-grid] failed to load GLTF "${source}": ${err}`))
      );
    });
  }
  return new Promise((resolve, reject) => {
    // Empty base path: only correct for a self-contained .glb (or a .gltf
    // with no external .bin/textures) - a raw ArrayBuffer has no URL to
    // resolve external references against.
    gltfLoader.parse(
      source,
      "",
      (gltf) => resolve(gltf.scene),
      (err) => reject(new Error(`[threejs-shadow-grid] failed to parse GLTF: ${err}`))
    );
  });
}

/** Raw (un-normalized) geometry+material pair extracted from one mesh in a GLTF scene graph. */
interface RawGltfPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Walks a loaded GLTF scene and collects one part per mesh, with each
 * mesh's local transform baked into its geometry up front (via
 * `matrixWorld`) so every part ends up in one common coordinate space -
 * required for `normalizeGltfParts` to compute a single correct combined
 * bounding box across parts that may sit at different positions/rotations
 * within the source scene graph.
 */
function extractGltfParts(scene: THREE.Group): RawGltfPart[] {
  scene.updateMatrixWorld(true);
  const parts: RawGltfPart[] = [];

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    let material = object.material as THREE.Material | THREE.Material[];
    if (Array.isArray(material)) {
      // Multi-material (per-face-group) meshes aren't split into separate
      // parts per group - that's a distinct sub-feature. Using the first
      // material keeps the mesh's geometry intact and rendering, at the
      // cost of any additional materials on it.
      // eslint-disable-next-line no-console
      console.warn(
        "[threejs-shadow-grid] a GLTF mesh has multiple per-face materials; only the first is used for the whole mesh."
      );
      material = material[0];
    }

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    parts.push({ geometry, material });
  });

  if (parts.length === 0) {
    throw new Error("[threejs-shadow-grid] GLTF model has no renderable meshes.");
  }

  return parts;
}

/**
 * Centers a set of GLTF parts on their *combined* bounding box and scales
 * them all by the *same* factor so the combined largest dimension equals
 * `targetSize` - the multi-part equivalent of `normalizeGeometry` below,
 * needed so a multi-material model's pieces stay spatially coherent as one
 * object instead of each normalizing independently. Also returns
 * `boundingRadius`: half the (post-scale) combined bounding box's diagonal -
 * the sphere, centered on the shared pivot every part now shares (the
 * combined box's center, translated to the origin), that circumscribes the
 * *whole* model regardless of orientation. Computed from the combined box
 * rather than each part's own `boundingSphere`, since a part's own sphere is
 * centered on that part's local center, not the shared origin the model
 * actually rotates about - relying on it alone would understate the reach of
 * a model whose parts sit far apart.
 */
function normalizeGltfParts(
  rawParts: RawGltfPart[],
  targetSize: number
): { parts: ModelPart[]; boundingRadius: number } {
  const combinedBox = new THREE.Box3();
  for (const { geometry } of rawParts) {
    geometry.computeBoundingBox();
    combinedBox.union(geometry.boundingBox!);
  }

  const size = new THREE.Vector3();
  combinedBox.getSize(size);
  const center = new THREE.Vector3();
  combinedBox.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  const boundingRadius = size.length() * scale * 0.5;

  const parts = rawParts.map(({ geometry, material }) => {
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { geometry, material };
  });

  return { parts, boundingRadius };
}

/**
 * Centers the geometry on its own origin and scales it so its largest
 * bounding-box dimension equals `targetSize`. This is what lets users
 * drop in wildly different STL files (different units, different scales,
 * off-center pivots) and still get a uniform-looking grid via one
 * `objectSize` config value. Also returns `boundingRadius`: half the
 * (post-scale) bounding box's diagonal, i.e. the sphere centered on the
 * origin (where the geometry now sits, and where `rotation` pivots it) that
 * circumscribes it regardless of orientation.
 */
function normalizeGeometry(
  geometry: THREE.BufferGeometry,
  targetSize: number
): { geometry: THREE.BufferGeometry; boundingRadius: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  geometry.translate(-center.x, -center.y, -center.z);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / maxDim;
  geometry.scale(scale, scale, scale);

  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const boundingRadius = size.length() * scale * 0.5;
  return { geometry, boundingRadius };
}

// Caches the raw (un-normalized) parsed result per URL, so re-fetching is
// avoided even if objectSize changes (each call normalizes its own clone of
// the geometry; GLTF materials are shared as-is - see setModels() for why
// that's safe). Keyed by URL only - an ArrayBuffer source is already in
// memory, and the same reference is essentially never passed twice.
const rawStlCache = new Map<string, Promise<THREE.BufferGeometry>>();
const rawGltfCache = new Map<string, Promise<RawGltfPart[]>>();

function loadRawStl(source: ModelSource): Promise<THREE.BufferGeometry> {
  if (typeof source !== "string") return loadStl(source);

  let pending = rawStlCache.get(source);
  if (!pending) {
    pending = loadStl(source);
    rawStlCache.set(source, pending);
  }
  return pending;
}

function loadRawGltf(source: ModelSource): Promise<RawGltfPart[]> {
  const load = async () => extractGltfParts(await loadGltfScene(source));
  if (typeof source !== "string") return load();

  let pending = rawGltfCache.get(source);
  if (!pending) {
    pending = load();
    rawGltfCache.set(source, pending);
  }
  return pending;
}

/**
 * Loads and normalizes every requested model to `objectSize`. Network
 * fetch/parse is cached by source; normalization always runs on a fresh
 * geometry clone so calling this again with a different `objectSize` is
 * safe. Format is auto-detected per source unless a request specifies one
 * explicitly - see `detectModelFormat`.
 *
 * A single model's load failure never rejects the whole call - it's caught,
 * logged (`[threejs-shadow-grid] ...`, so a demo/consumer console or an
 * error-log overlay can surface exactly which model and why), and that
 * model resolves to zero parts instead. `GridBuilder` renders a zero-part
 * model as no `InstancedMesh` at all, so the grid cells that would have
 * used it simply go empty while every other (successfully loaded) model
 * keeps rendering normally - one bad URL/unsupported file doesn't blank
 * the whole grid.
 */
export async function loadModels(requests: ModelRequest[], objectSize: number): Promise<LoadedModel[]> {
  return Promise.all(
    requests.map(async ({ source, format, colorOverride }): Promise<LoadedModel> => {
      try {
        const resolvedFormat = detectModelFormat(source, format);

        if (resolvedFormat === "gltf") {
          const rawParts = await loadRawGltf(source);
          const clonedRawParts = rawParts.map(({ geometry, material }) => ({ geometry: geometry.clone(), material }));
          const { parts, boundingRadius } = normalizeGltfParts(clonedRawParts, objectSize);
          return { parts, colorOverride, boundingRadius };
        }

        const rawGeometry = await loadRawStl(source);
        const { geometry, boundingRadius } = normalizeGeometry(rawGeometry.clone(), objectSize);
        return { parts: [{ geometry, material: null }], colorOverride, boundingRadius };
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err);
        return { parts: [], colorOverride, boundingRadius: 0 };
      }
    })
  );
}

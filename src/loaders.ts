import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { ModelSource } from "./types";

const stlLoader = new STLLoader();

/** Loads a single STL source (URL string or already-fetched ArrayBuffer) into a BufferGeometry. */
async function loadOne(source: ModelSource): Promise<THREE.BufferGeometry> {
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

/**
 * Centers the geometry on its own origin and scales it so its largest
 * bounding-box dimension equals `targetSize`. This is what lets users
 * drop in wildly different STL files (different units, different scales,
 * off-center pivots) and still get a uniform-looking grid via one
 * `objectSize` config value.
 */
function normalizeGeometry(geometry: THREE.BufferGeometry, targetSize: number): THREE.BufferGeometry {
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
  return geometry;
}

// Caches the *raw* (un-normalized) parsed geometry per URL, so re-fetching
// the same URL is avoided even if objectSize changes between calls (each
// call normalizes its own clone rather than mutating a shared instance).
// Keyed by URL string only - an ArrayBuffer source is already in memory (no
// network fetch to dedupe), and since the exact same ArrayBuffer reference is
// essentially never passed twice, caching by its identity would just retain
// every ArrayBuffer-sourced geometry forever with no benefit.
const rawCache = new Map<string, Promise<THREE.BufferGeometry>>();

function loadRaw(source: ModelSource): Promise<THREE.BufferGeometry> {
  if (typeof source !== "string") return loadOne(source);

  let pending = rawCache.get(source);
  if (!pending) {
    pending = loadOne(source);
    rawCache.set(source, pending);
  }
  return pending;
}

/**
 * Loads and normalizes every model in `sources` to `objectSize`. Network
 * fetch/parse is cached by source; normalization always runs on a fresh
 * clone so calling this again with a different `objectSize` is safe.
 */
export async function loadModels(sources: ModelSource[], objectSize: number): Promise<THREE.BufferGeometry[]> {
  const raw = await Promise.all(sources.map(loadRaw));
  return raw.map((geometry) => normalizeGeometry(geometry.clone(), objectSize));
}

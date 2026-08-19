import * as THREE from "three";
import type { ColorConfig } from "./types";

/**
 * Picks a color for one grid instance.
 * - Single string -> always that color.
 * - Array -> deterministically "random" pick (via the supplied rng) from
 *   the palette, so e.g. config.colors = ["#ff4d4d", "#4d79ff", "#4dff88"]
 *   gives each object one of the three colors at random.
 */
export function pickColor(colors: ColorConfig, rng: () => number): THREE.Color {
  if (Array.isArray(colors)) {
    if (colors.length === 0) return new THREE.Color("#ffffff");
    if (colors.length === 1) return new THREE.Color(colors[0]);
    const index = Math.floor(rng() * colors.length) % colors.length;
    return new THREE.Color(colors[index]);
  }
  return new THREE.Color(colors);
}

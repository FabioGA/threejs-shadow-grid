import * as THREE from "three";
import type { ColorConfig, WeightedColor } from "./types";

function isWeightedPalette(colors: string[] | WeightedColor[]): colors is WeightedColor[] {
  return colors.length > 0 && typeof colors[0] === "object";
}

/** Fisher-Yates shuffle, in place, driven by the supplied (seeded) rng. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Deterministically partitions `total` instances across a weighted palette
 * proportionally to each color's weight (largest-remainder rounding so the
 * counts always add up to exactly `total`), then shuffles the assignment
 * so same-colored instances aren't clustered in generation order.
 */
export function buildWeightedAssignment(entries: WeightedColor[], total: number, rng: () => number): THREE.Color[] {
  const sumWeights = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (sumWeights <= 0) {
    const fallback = new THREE.Color(entries[0]?.color ?? "#ffffff");
    return new Array(total).fill(fallback);
  }

  const assignment: THREE.Color[] = [];
  let remaining = total;
  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    // Clamp each non-last share to what's actually left: independently rounding
    // every entry's share can otherwise overshoot `total` (e.g. four equal
    // weights splitting a total of 2 each round 0.5 up to 1, summing to 3).
    const rounded = Math.round((Math.max(0, entry.weight) / sumWeights) * total);
    const count = isLast ? Math.max(0, remaining) : Math.min(Math.max(0, remaining), rounded);
    remaining -= count;
    const color = new THREE.Color(entry.color);
    for (let j = 0; j < count; j++) assignment.push(color);
  });

  return shuffle(assignment, rng);
}

/**
 * A picker consumed once per grid cell, in cell-generation order, to
 * produce that cell's color. Building it once per rebuild (rather than
 * re-deciding per color config type on every cell) is what lets the
 * weighted-palette case pre-partition the exact instance total up front.
 */
export type ColorPicker = () => THREE.Color;

/** Builds a color picker for `total` upcoming grid cells from a `ColorConfig`. */
export function createColorPicker(colors: ColorConfig, total: number, rng: () => number): ColorPicker {
  if (typeof colors === "string") {
    const color = new THREE.Color(colors);
    return () => color;
  }

  if (colors.length === 0) {
    const color = new THREE.Color("#ffffff");
    return () => color;
  }

  if (isWeightedPalette(colors)) {
    const assignment = buildWeightedAssignment(colors, total, rng);
    let index = 0;
    return () => assignment[index++] ?? assignment[assignment.length - 1];
  }

  const palette = colors;
  if (palette.length === 1) {
    const color = new THREE.Color(palette[0]);
    return () => color;
  }
  return () => new THREE.Color(palette[Math.floor(rng() * palette.length) % palette.length]);
}

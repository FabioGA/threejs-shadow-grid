/** Fisher-Yates shuffle, in place, driven by the supplied (seeded) rng. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Deterministically partitions `total` grid cells across model indices
 * proportionally to each entry's weight (largest-remainder rounding so the
 * counts always add up to exactly `total`), then shuffles the assignment so
 * same-model instances aren't clustered in generation order. Mirrors
 * colors.ts's buildWeightedAssignment for the same reason: exact
 * proportions rather than independent per-cell dice rolls.
 */
export function buildWeightedModelAssignment(weights: number[], total: number, rng: () => number): number[] {
  const sumWeights = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (sumWeights <= 0) {
    return new Array(total).fill(0);
  }

  const assignment: number[] = [];
  let remaining = total;
  weights.forEach((weight, i) => {
    const isLast = i === weights.length - 1;
    const rounded = Math.round((Math.max(0, weight) / sumWeights) * total);
    const count = isLast ? Math.max(0, remaining) : Math.min(Math.max(0, remaining), rounded);
    remaining -= count;
    for (let j = 0; j < count; j++) assignment.push(i);
  });

  return shuffle(assignment, rng);
}

/** A picker consumed once per grid cell, in cell-generation order, to produce that cell's model index. */
export type ModelIndexPicker = () => number;

/**
 * Builds a model-index picker for `total` upcoming grid cells.
 * `weights === null` (no weighted entries given) keeps the original
 * behavior: an independent random pick per cell, same as an unweighted
 * `ColorConfig` palette.
 */
export function createModelIndexPicker(
  modelCount: number,
  weights: number[] | null,
  total: number,
  rng: () => number
): ModelIndexPicker {
  if (!weights) {
    return () => Math.floor(rng() * modelCount) % modelCount;
  }

  const assignment = buildWeightedModelAssignment(weights, total, rng);
  let index = 0;
  return () => assignment[index++] ?? assignment[assignment.length - 1] ?? 0;
}

import { describe, expect, it } from "vitest";
import { buildWeightedModelAssignment, createModelIndexPicker } from "../models";
import { createRng } from "../random";

describe("createModelIndexPicker", () => {
  it("always returns 0 for a single model", () => {
    const picker = createModelIndexPicker(1, null, 10, createRng(1));
    const indices = Array.from({ length: 10 }, () => picker());
    expect(indices.every((i) => i === 0)).toBe(true);
  });

  it("picks from every model index using the supplied rng when unweighted", () => {
    const picker = createModelIndexPicker(3, null, 200, createRng(7));
    const seen = new Set(Array.from({ length: 200 }, () => picker()));
    expect(seen).toEqual(new Set([0, 1, 2]));
  });

  it("is deterministic for a given seed", () => {
    const a = createModelIndexPicker(3, null, 30, createRng(99));
    const b = createModelIndexPicker(3, null, 30, createRng(99));
    const seqA = Array.from({ length: 30 }, () => a());
    const seqB = Array.from({ length: 30 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("partitions weighted models proportionally and sums to exactly total", () => {
    const total = 1000;
    const picker = createModelIndexPicker(3, [50, 30, 20], total, createRng(1));
    const counts = [0, 0, 0];
    for (let i = 0; i < total; i++) counts[picker()]++;

    expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
    expect(counts[0]).toBeCloseTo(500, -1);
    expect(counts[1]).toBeCloseTo(300, -1);
    expect(counts[2]).toBeCloseTo(200, -1);
  });

  it("handles a single weighted model by assigning it every instance", () => {
    const picker = createModelIndexPicker(1, [5], 12, createRng(1));
    const indices = Array.from({ length: 12 }, () => picker());
    expect(indices.every((i) => i === 0)).toBe(true);
  });

  it("falls back to the first model when all weights are zero or negative", () => {
    const picker = createModelIndexPicker(2, [0, -5], 10, createRng(1));
    const indices = Array.from({ length: 10 }, () => picker());
    expect(indices.every((i) => i === 0)).toBe(true);
  });

  it("does not throw when building an assignment for total 0", () => {
    expect(() => createModelIndexPicker(2, [1, 1], 0, createRng(1))).not.toThrow();
  });
});

describe("buildWeightedModelAssignment", () => {
  it("always builds exactly `total` entries, even when independently-rounded shares would overshoot it", () => {
    const weights = [1, 1, 1, 1];
    for (const total of [0, 1, 2, 3, 4, 5, 6, 9]) {
      const assignment = buildWeightedModelAssignment(weights, total, createRng(total));
      expect(assignment.length).toBe(total);
    }
  });

  it("keeps the sum exact across a range of weight/total combinations", () => {
    const weightSets = [
      [1, 1, 1, 1],
      [5, 3, 2],
      [1, 1, 1, 1, 1, 1, 1],
      [7, 1],
    ];
    for (const weights of weightSets) {
      for (const total of [0, 1, 2, 3, 10, 17]) {
        const assignment = buildWeightedModelAssignment(weights, total, createRng(total));
        expect(assignment.length).toBe(total);
      }
    }
  });
});

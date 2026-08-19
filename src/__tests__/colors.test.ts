import { describe, expect, it } from "vitest";
import { buildWeightedAssignment, createColorPicker } from "../colors";
import { createRng } from "../random";

describe("createColorPicker", () => {
  it("returns the same color every time for a single CSS color string", () => {
    const picker = createColorPicker("#ff0000", 50, createRng(1));
    const colors = Array.from({ length: 10 }, () => picker());
    expect(colors.every((c) => c.getHexString() === "ff0000")).toBe(true);
  });

  it("picks from a plain array palette using the supplied rng", () => {
    const palette = ["#ff0000", "#00ff00", "#0000ff"];
    const picker = createColorPicker(palette, 200, createRng(7));
    const seen = new Set(Array.from({ length: 200 }, () => picker().getHexString()));
    expect(seen).toEqual(new Set(["ff0000", "00ff00", "0000ff"]));
  });

  it("is deterministic for a given seed", () => {
    const palette = ["#ff0000", "#00ff00", "#0000ff"];
    const a = createColorPicker(palette, 30, createRng(99));
    const b = createColorPicker(palette, 30, createRng(99));
    const seqA = Array.from({ length: 30 }, () => a().getHexString());
    const seqB = Array.from({ length: 30 }, () => b().getHexString());
    expect(seqA).toEqual(seqB);
  });

  it("returns the single color for a one-element array palette", () => {
    const picker = createColorPicker(["#123456"], 5, createRng(1));
    expect(picker().getHexString()).toBe("123456");
  });

  it("falls back to white for an empty color array", () => {
    const picker = createColorPicker([], 5, createRng(1));
    expect(picker().getHexString()).toBe("ffffff");
  });

  it("partitions a weighted palette proportionally and sums to exactly total", () => {
    const palette = [
      { color: "#ff0000", weight: 50 },
      { color: "#00ff00", weight: 30 },
      { color: "#0000ff", weight: 20 },
    ];
    const total = 1000;
    const picker = createColorPicker(palette, total, createRng(1));
    const counts: Record<string, number> = { ff0000: 0, "00ff00": 0, "0000ff": 0 };
    for (let i = 0; i < total; i++) counts[picker().getHexString()]++;

    const sum = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(total);
    expect(counts.ff0000).toBeCloseTo(500, -1);
    expect(counts["00ff00"]).toBeCloseTo(300, -1);
    expect(counts["0000ff"]).toBeCloseTo(200, -1);
  });

  it("sums to exactly total even when weights don't divide it evenly", () => {
    const palette = [
      { color: "#ff0000", weight: 1 },
      { color: "#00ff00", weight: 1 },
      { color: "#0000ff", weight: 1 },
    ];
    for (const total of [1, 2, 4, 7, 10, 13]) {
      const picker = createColorPicker(palette, total, createRng(total));
      let count = 0;
      for (let i = 0; i < total; i++) {
        picker();
        count++;
      }
      expect(count).toBe(total);
    }
  });

  it("handles a single weighted entry by assigning it every instance", () => {
    const picker = createColorPicker([{ color: "#abcdef", weight: 5 }], 12, createRng(1));
    const colors = Array.from({ length: 12 }, () => picker().getHexString());
    expect(colors.every((c) => c === "abcdef")).toBe(true);
  });

  it("falls back to the first color when all weights are zero or negative", () => {
    const palette = [
      { color: "#111111", weight: 0 },
      { color: "#222222", weight: -5 },
    ];
    const picker = createColorPicker(palette, 10, createRng(1));
    const colors = Array.from({ length: 10 }, () => picker().getHexString());
    expect(colors.every((c) => c === "111111")).toBe(true);
  });

  it("does not throw when building an assignment for total 0", () => {
    const palette = [{ color: "#ff0000", weight: 1 }];
    expect(() => createColorPicker(palette, 0, createRng(1))).not.toThrow();
  });
});

describe("buildWeightedAssignment", () => {
  it("always builds exactly `total` entries, even when independently-rounded shares would overshoot it", () => {
    // Regression case: 4 equal weights splitting a total of 2 - each share
    // rounds (half-up) from 0.5 to 1, so naively summing the first 3 rounded
    // shares alone already reaches 3, one more than the requested total.
    const palette = [
      { color: "#111111", weight: 1 },
      { color: "#222222", weight: 1 },
      { color: "#333333", weight: 1 },
      { color: "#444444", weight: 1 },
    ];
    for (const total of [0, 1, 2, 3, 4, 5, 6, 9]) {
      const assignment = buildWeightedAssignment(palette, total, createRng(total));
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
      const palette = weights.map((weight, i) => ({ color: `#${(i + 1).toString(16).padStart(6, "0")}`, weight }));
      for (const total of [0, 1, 2, 3, 10, 17]) {
        const assignment = buildWeightedAssignment(palette, total, createRng(total));
        expect(assignment.length).toBe(total);
      }
    }
  });
});

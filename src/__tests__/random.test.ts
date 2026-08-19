import { describe, expect, it } from "vitest";
import { createRng } from "../random";

describe("createRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRng(1337);
    const b = createRng(1337);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("always returns a value in [0, 1)", () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("handles a zero seed without throwing or degenerating to a constant", () => {
    const rng = createRng(0);
    const values = new Set(Array.from({ length: 10 }, () => rng()));
    expect(values.size).toBeGreaterThan(1);
  });
});

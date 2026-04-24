import { describe, expect, it, vi } from "vitest";
import {
  LineWidthStore,
  scaleLineWidth,
  DEFAULT_LINE_WIDTH_FACTORS,
  LINE_WIDTH_MIN,
  LINE_WIDTH_MAX,
} from "../../src/state/lineWidthStore";

describe("scaleLineWidth", () => {
  it("scales a numeric line-width", () => {
    expect(scaleLineWidth(1.1, 2)).toBe(2.2);
    expect(scaleLineWidth(0.8, 0.5)).toBe(0.4);
  });

  it("preserves base expression header and scales each stop value of interpolate", () => {
    const base = ["interpolate", ["linear"], ["zoom"], 10, 0.3, 14, 1.0, 16, 2.4] as const;
    const scaled = scaleLineWidth(base as unknown as unknown[], 2);
    expect(scaled).toEqual(["interpolate", ["linear"], ["zoom"], 10, 0.6, 14, 2.0, 16, 4.8]);
  });

  it("returns the base untouched for factor=1", () => {
    expect(scaleLineWidth(1.1, 1)).toBe(1.1);
  });
});

describe("LineWidthStore", () => {
  it("starts at 1.0 for all categories", () => {
    const s = new LineWidthStore();
    expect(s.factors).toEqual(DEFAULT_LINE_WIDTH_FACTORS);
  });

  it("increase multiplies factor by 1.25", () => {
    const s = new LineWidthStore();
    s.increase("road");
    expect(s.factors.road).toBeCloseTo(1.25, 5);
  });

  it("decrease divides factor by 1.25", () => {
    const s = new LineWidthStore();
    s.decrease("road");
    expect(s.factors.road).toBeCloseTo(1 / 1.25, 5);
  });

  it("clamps at LINE_WIDTH_MAX when increasing beyond upper bound", () => {
    const s = new LineWidthStore();
    for (let i = 0; i < 30; i++) s.increase("road");
    expect(s.factors.road).toBe(LINE_WIDTH_MAX);
  });

  it("clamps at LINE_WIDTH_MIN when decreasing below lower bound", () => {
    const s = new LineWidthStore();
    for (let i = 0; i < 30; i++) s.decrease("road");
    expect(s.factors.road).toBe(LINE_WIDTH_MIN);
  });

  it("reset restores all factors to 1.0 and fires listener", () => {
    const s = new LineWidthStore();
    s.increase("road");
    s.decrease("roadEdge");
    s.increase("building");
    const l = vi.fn();
    s.subscribe(l);
    s.reset();
    expect(s.factors).toEqual(DEFAULT_LINE_WIDTH_FACTORS);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("reset when already default does not fire listener", () => {
    const s = new LineWidthStore();
    const l = vi.fn();
    s.subscribe(l);
    s.reset();
    expect(l).not.toHaveBeenCalled();
  });

  it("subscribe fires on increase/decrease", () => {
    const s = new LineWidthStore();
    const l = vi.fn();
    s.subscribe(l);
    s.increase("water");
    s.decrease("boundary");
    expect(l).toHaveBeenCalledTimes(2);
  });

  it("increase at MAX is a no-op (no listener call)", () => {
    const s = new LineWidthStore();
    for (let i = 0; i < 30; i++) s.increase("road");
    const l = vi.fn();
    s.subscribe(l);
    s.increase("road");
    expect(l).not.toHaveBeenCalled();
  });
});

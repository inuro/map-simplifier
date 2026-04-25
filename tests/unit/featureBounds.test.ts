import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import {
  centerOfBounds,
  expandBoundsByFactor,
  geometryBounds,
  pointInBounds,
  unionBounds,
  type LngLatBounds,
} from "../../src/map/featureBounds";

describe("geometryBounds", () => {
  it("Point", () => {
    expect(geometryBounds({ type: "Point", coordinates: [10, 20] })).toEqual([10, 20, 10, 20]);
  });

  it("LineString", () => {
    const g: Geometry = { type: "LineString", coordinates: [[0, 0], [3, 4], [-1, 2]] };
    expect(geometryBounds(g)).toEqual([-1, 0, 3, 4]);
  });

  it("Polygon は exterior ring を含む全 ring から", () => {
    const g: Geometry = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      ],
    };
    expect(geometryBounds(g)).toEqual([0, 0, 10, 10]);
  });

  it("MultiLineString", () => {
    const g: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [[0, 0], [5, 5]],
        [[-3, 1], [4, -2]],
      ],
    };
    expect(geometryBounds(g)).toEqual([-3, -2, 5, 5]);
  });

  it("MultiPolygon は全 polygon の全 ring から", () => {
    const g: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
      ],
    };
    expect(geometryBounds(g)).toEqual([0, 0, 11, 11]);
  });

  it("GeometryCollection は子の合成", () => {
    const g: Geometry = {
      type: "GeometryCollection",
      geometries: [
        { type: "Point", coordinates: [0, 0] },
        { type: "Point", coordinates: [5, -3] },
      ],
    };
    expect(geometryBounds(g)).toEqual([0, -3, 5, 0]);
  });
});

describe("unionBounds", () => {
  it("空配列は null", () => {
    expect(unionBounds([])).toBeNull();
  });

  it("複数 BBox の min/max", () => {
    const a: LngLatBounds = [0, 0, 10, 10];
    const b: LngLatBounds = [-5, 3, 8, 20];
    expect(unionBounds([a, b])).toEqual([-5, 0, 10, 20]);
  });
});

describe("expandBoundsByFactor", () => {
  it("factor=1 は同じ BBox", () => {
    const b: LngLatBounds = [0, 0, 10, 10];
    expect(expandBoundsByFactor(b, 1)).toEqual([0, 0, 10, 10]);
  });

  it("factor=2 は中心を保ったまま各辺 2 倍（面積 4 倍）", () => {
    const b: LngLatBounds = [0, 0, 10, 10];
    expect(expandBoundsByFactor(b, 2)).toEqual([-5, -5, 15, 15]);
  });

  it("非対称な BBox でも中心を保つ", () => {
    const b: LngLatBounds = [10, 20, 14, 30]; // center (12, 25), w=4, h=10
    // factor=2 → halfW=4, halfH=10 → (8,15)-(16,35)
    expect(expandBoundsByFactor(b, 2)).toEqual([8, 15, 16, 35]);
  });

  it("退化 BBox（点）は factor によらず点のまま", () => {
    const b: LngLatBounds = [5, 5, 5, 5];
    expect(expandBoundsByFactor(b, 4)).toEqual([5, 5, 5, 5]);
  });
});

describe("centerOfBounds / pointInBounds", () => {
  it("centerOfBounds は両軸の中点", () => {
    expect(centerOfBounds([0, 0, 10, 20])).toEqual([5, 10]);
    expect(centerOfBounds([-4, 6, 6, 10])).toEqual([1, 8]);
  });

  it("pointInBounds は境界含む内側で true、外側で false", () => {
    const b: LngLatBounds = [0, 0, 10, 10];
    expect(pointInBounds([5, 5], b)).toBe(true);
    expect(pointInBounds([0, 0], b)).toBe(true); // 境界
    expect(pointInBounds([10, 10], b)).toBe(true); // 境界
    expect(pointInBounds([-0.001, 5], b)).toBe(false);
    expect(pointInBounds([5, 10.001], b)).toBe(false);
    expect(pointInBounds([15, 5], b)).toBe(false);
  });
});

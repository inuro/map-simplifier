import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import {
  pointToSegmentDistance,
  screenDistanceToFeature,
  type ProjectFn,
} from "../../src/map/featureDistance";

/** テスト用：lng/lat をそのまま 1:1 で screen 座標にマップする（px として扱う）。 */
const identityProject: ProjectFn = (lng, lat) => ({ x: lng, y: lat });

describe("pointToSegmentDistance", () => {
  it("点が線分上にあれば 0", () => {
    expect(pointToSegmentDistance({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(0);
  });

  it("線分に対する垂線距離", () => {
    expect(
      pointToSegmentDistance({ x: 1, y: 3 }, { x: 0, y: 0 }, { x: 2, y: 0 }),
    ).toBeCloseTo(3);
  });

  it("線分の外側は端点までの距離", () => {
    expect(
      pointToSegmentDistance({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }),
    ).toBeCloseTo(3);
    expect(
      pointToSegmentDistance({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }),
    ).toBeCloseTo(3);
  });

  it("退化線分（ゼロ長）は端点までの距離", () => {
    expect(
      pointToSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }),
    ).toBeCloseTo(5);
  });
});

describe("screenDistanceToFeature - Point", () => {
  it("点までの距離を返す", () => {
    const g: Geometry = { type: "Point", coordinates: [3, 4] };
    expect(screenDistanceToFeature({ x: 0, y: 0 }, g, identityProject)).toBeCloseTo(5);
  });
});

describe("screenDistanceToFeature - LineString", () => {
  const g: Geometry = {
    type: "LineString",
    coordinates: [
      [0, 0],
      [10, 0],
      [10, 10],
    ],
  };

  it("線上は 0", () => {
    expect(screenDistanceToFeature({ x: 5, y: 0 }, g, identityProject)).toBe(0);
  });

  it("線から 3px 離れた点は距離 3", () => {
    expect(screenDistanceToFeature({ x: 5, y: 3 }, g, identityProject)).toBeCloseTo(3);
  });

  it("折れ線の第二セグメントまでの距離", () => {
    expect(screenDistanceToFeature({ x: 13, y: 5 }, g, identityProject)).toBeCloseTo(3);
  });
});

describe("screenDistanceToFeature - Polygon", () => {
  const square: Geometry = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  };

  it("内部は距離 0", () => {
    expect(screenDistanceToFeature({ x: 5, y: 5 }, square, identityProject)).toBe(0);
  });

  it("辺の外側は辺までの距離", () => {
    expect(screenDistanceToFeature({ x: 12, y: 5 }, square, identityProject)).toBeCloseTo(2);
  });

  it("頂点の外側は頂点までの距離", () => {
    expect(screenDistanceToFeature({ x: 13, y: 14 }, square, identityProject)).toBeCloseTo(5);
  });
});

describe("screenDistanceToFeature - Multi*", () => {
  it("MultiLineString は全 line の最小", () => {
    const g: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [10, 0],
        ],
        [
          [0, 100],
          [10, 100],
        ],
      ],
    };
    expect(screenDistanceToFeature({ x: 5, y: 2 }, g, identityProject)).toBeCloseTo(2);
  });

  it("MultiPolygon で内部のどこかに含まれていれば 0", () => {
    const g: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
        [
          [
            [100, 100],
            [110, 100],
            [110, 110],
            [100, 110],
            [100, 100],
          ],
        ],
      ],
    };
    expect(screenDistanceToFeature({ x: 105, y: 105 }, g, identityProject)).toBe(0);
  });
});

describe("screenDistanceToFeature - project 関数経由", () => {
  it("lng/lat を 10 倍に拡大する project でもスケールされた距離になる", () => {
    const g: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 0],
      ],
    };
    const project: ProjectFn = (lng, lat) => ({ x: lng * 10, y: lat * 10 });
    // 点 (0.5, 0.3) は screen 上で (5, 3) → 線分 [(0,0),(10,0)] までの距離は 3
    expect(screenDistanceToFeature({ x: 5, y: 3 }, g, project)).toBeCloseTo(3);
  });
});

import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import {
  areLikelyTileSplitParts,
  featureGeometryKey,
  protectedFeatureKeysForInverseDelete,
  sourceTileZoomCandidates,
  stableStringify,
  type FeatureIdentityInput,
} from "../../src/map/featureIdentity";

const project = (lng: number, lat: number) => ({ x: lng * 10, y: lat * -10 });

function polygon(minLng: number, minLat: number, maxLng: number, maxLat: number): Geometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

function feature(
  sourceLayer: string,
  geometry: Geometry,
  properties: Record<string, unknown> = { vt_code: 3111 },
): FeatureIdentityInput {
  return { sourceLayer, geometry, properties };
}

describe("stableStringify", () => {
  it("object key order に依存しない", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
  });

  it("nested object / array も安定化する", () => {
    expect(stableStringify({ z: [{ b: 2, a: 1 }] })).toBe(
      stableStringify({ z: [{ a: 1, b: 2 }] }),
    );
  });
});

describe("sourceTileZoomCandidates", () => {
  it("現在 zoom の floor/ceil を GSI source zoom 範囲内に丸める", () => {
    expect(sourceTileZoomCandidates(15.25)).toEqual([15, 16]);
    expect(sourceTileZoomCandidates(16.8)).toEqual([16]);
    expect(sourceTileZoomCandidates(3.2)).toEqual([4]);
  });
});

describe("areLikelyTileSplitParts", () => {
  it("同じ属性でタイル境界上に接している geometry を split partial とみなす", () => {
    const left = feature("BldA", polygon(-1, 0, 0, 1));
    const right = feature("BldA", polygon(0, 0, 1, 1));

    expect(areLikelyTileSplitParts(left, right, project, [1])).toBe(true);
  });

  it("同じ属性でも離れた geometry は split partial とみなさない", () => {
    const selected = feature("BldA", polygon(-1, 0, 0, 1));
    const far = feature("BldA", polygon(10, 0, 11, 1));

    expect(areLikelyTileSplitParts(selected, far, project, [1])).toBe(false);
  });

  it("同じ属性で接していてもタイル境界でなければ split partial とみなさない", () => {
    const selected = feature("BldA", polygon(4, 10, 5, 11));
    const touchingNeighbor = feature("BldA", polygon(5, 10, 6, 11));

    expect(areLikelyTileSplitParts(selected, touchingNeighbor, project, [1])).toBe(false);
  });

  it("sourceLayer が違うものは split partial とみなさない", () => {
    const selected = feature("BldA", polygon(-1, 0, 0, 1));
    const otherLayer = feature("StrctArea", polygon(0, 0, 1, 1));

    expect(areLikelyTileSplitParts(selected, otherLayer, project, [1])).toBe(false);
  });
});

describe("protectedFeatureKeysForInverseDelete", () => {
  it("選択済み geometry と、タイル境界でつながる同一属性 partial だけを保護する", () => {
    const selected = feature("BldA", polygon(-1, 0, 0, 1), { vt_code: 3111 });
    const splitPart = feature("BldA", polygon(0, 0, 1, 1), { vt_code: 3111 });
    const samePropsFarAway = feature("BldA", polygon(10, 0, 11, 1), { vt_code: 3111 });
    const differentPropsTouching = feature("BldA", polygon(0, 1, 1, 2), { vt_code: 9999 });

    const protectedKeys = protectedFeatureKeysForInverseDelete({
      selected: [selected],
      candidates: [selected, splitPart, samePropsFarAway, differentPropsTouching],
      project,
      sourceZooms: [1],
    });

    expect(protectedKeys.has(featureGeometryKey(selected))).toBe(true);
    expect(protectedKeys.has(featureGeometryKey(splitPart))).toBe(true);
    expect(protectedKeys.has(featureGeometryKey(samePropsFarAway))).toBe(false);
    expect(protectedKeys.has(featureGeometryKey(differentPropsTouching))).toBe(false);
  });

  it("直接選択部分から連続する split partial を推移的に保護する", () => {
    const selected = feature("AdmArea", polygon(-45, 0, 0, 1), { vt_code: 1103 });
    const part2 = feature("AdmArea", polygon(0, 0, 45, 1), { vt_code: 1103 });
    const part3 = feature("AdmArea", polygon(45, 0, 90, 1), { vt_code: 1103 });

    const protectedKeys = protectedFeatureKeysForInverseDelete({
      selected: [selected],
      candidates: [part3, part2],
      project,
      sourceZooms: [3],
    });

    expect(protectedKeys.has(featureGeometryKey(part2))).toBe(true);
    expect(protectedKeys.has(featureGeometryKey(part3))).toBe(true);
  });
});

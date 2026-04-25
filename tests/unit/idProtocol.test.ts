import { describe, expect, it } from "vitest";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- CJS module, typed via src/types/vt-pbf.d.ts
import vtpbf from "vt-pbf";
import {
  injectIdsIntoTilePbf,
  tileCoordFromUrl,
  tileFeatureId,
  toProtocolUrl,
  toRealUrl,
} from "../../src/map/idProtocol";

describe("URL helpers", () => {
  it("wraps https URL into gsi-ids://", () => {
    expect(toProtocolUrl("https://example.com/x.pbf")).toBe("gsi-ids://example.com/x.pbf");
  });

  it("wraps http URL into gsi-ids://", () => {
    expect(toProtocolUrl("http://example.com/x.pbf")).toBe("gsi-ids://example.com/x.pbf");
  });

  it("leaves non-http URLs alone", () => {
    expect(toProtocolUrl("file:///tmp/x.pbf")).toBe("file:///tmp/x.pbf");
  });

  it("unwraps gsi-ids:// back to https://", () => {
    expect(toRealUrl("gsi-ids://example.com/x.pbf")).toBe("https://example.com/x.pbf");
  });

  it("leaves non gsi-ids URL alone", () => {
    expect(toRealUrl("https://example.com/x.pbf")).toBe("https://example.com/x.pbf");
  });
});

describe("tile id helpers", () => {
  it("parses z/x/y from a GSI tile URL", () => {
    expect(
      tileCoordFromUrl("https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/16/58500/24064.pbf"),
    ).toEqual({ z: 16, x: 58500, y: 24064 });
    expect(
      tileCoordFromUrl(
        "gsi-ids://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/15/29250/12032.pbf?foo=1",
      ),
    ).toEqual({ z: 15, x: 29250, y: 12032 });
  });

  it("packs z/x/y/featureIndex into a safe, non-zero integer id", () => {
    const id = tileFeatureId({ z: 16, x: 58500, y: 24064 }, 117);
    expect(id).toBe(4754856791244918);
    expect(Number.isSafeInteger(id)).toBe(true);
  });

  it("uses different ids for the same feature index in adjacent tiles", () => {
    const a = tileFeatureId({ z: 16, x: 58500, y: 24064 }, 0);
    const b = tileFeatureId({ z: 16, x: 58501, y: 24064 }, 0);
    expect(a).not.toBe(b);
  });
});

// 既知の境界：loadGeometry/type/properties を持つシムを vt-pbf に渡して
// タイル pbf を得て、それを injectIdsIntoTilePbf に通すと id が振られる。
function buildShimTilePbf(): ArrayBuffer {
  const roadShim = {
    length: 2,
    name: "road",
    version: 2,
    extent: 4096,
    feature(i: number) {
      return {
        type: 2 as const,
        properties: {},
        loadGeometry() {
          return [[
            { x: 0, y: 0 },
            { x: 10 * (i + 1), y: 10 * (i + 1) },
          ]];
        },
      };
    },
  };
  const buildingShim = {
    length: 1,
    name: "building",
    version: 2,
    extent: 4096,
    feature() {
      return {
        type: 3 as const,
        properties: { name: "x" },
        loadGeometry() {
          return [[
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
            { x: 0, y: 4 },
            { x: 0, y: 0 },
          ]];
        },
      };
    },
  };
  const u8 = vtpbf({ layers: { road: roadShim, building: buildingShim } });
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

describe("injectIdsIntoTilePbf", () => {
  it("returns empty buffer for empty input", () => {
    const out = injectIdsIntoTilePbf(new ArrayBuffer(0));
    expect(out.byteLength).toBe(0);
  });

  it("round-trips a tile and assigns tile-scoped feature ids per layer", () => {
    const buf = buildShimTilePbf();
    const tileCoord = { z: 16, x: 58500, y: 24064 };
    const out = injectIdsIntoTilePbf(buf, tileCoord);
    expect(out.byteLength).toBeGreaterThan(0);

    const tile = new VectorTile(new Pbf(out));
    expect(Object.keys(tile.layers).sort()).toEqual(["building", "road"]);

    const road = tile.layers["road"]!;
    expect(road.length).toBe(2);
    expect(road.feature(0).id).toBe(tileFeatureId(tileCoord, 0));
    expect(road.feature(1).id).toBe(tileFeatureId(tileCoord, 1));

    const building = tile.layers["building"]!;
    expect(building.length).toBe(1);
    expect(building.feature(0).id).toBe(tileFeatureId(tileCoord, 0));
    expect(building.feature(0).properties["name"]).toBe("x");
  });

  it("preserves geometry through the round-trip (within integer quantization)", () => {
    const buf = buildShimTilePbf();
    const out = injectIdsIntoTilePbf(buf);
    const tile = new VectorTile(new Pbf(out));
    const rings = tile.layers["building"]!.feature(0).loadGeometry();
    // Polygon [[0,0],[4,0],[4,4],[0,4],[0,0]] が復元されている
    expect(rings).toHaveLength(1);
    const ring = rings[0]!;
    expect(ring.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ]);
  });
});

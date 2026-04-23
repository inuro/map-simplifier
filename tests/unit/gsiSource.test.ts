import { describe, expect, it } from "vitest";
import {
  GSI_BVMAP_TILE_URL,
  GSI_ATTRIBUTION,
  buildGsiVectorSource,
} from "../../src/map/gsiSource";

describe("GSI vector tile source", () => {
  it("points at the experimental bvmap endpoint", () => {
    expect(GSI_BVMAP_TILE_URL).toBe(
      "https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf",
    );
  });

  it("includes an attribution naming 国土地理院 or 地理院タイル", () => {
    // 利用規約上、出典として「国土地理院」または「地理院タイル」のいずれかを
    // 明示する必要がある。
    expect(GSI_ATTRIBUTION).toMatch(/(国土地理院|地理院タイル)/);
  });

  it("builds a MapLibre vector source config with tiles, minzoom, maxzoom", () => {
    const src = buildGsiVectorSource();
    expect(src.type).toBe("vector");
    expect(src.tiles).toEqual([GSI_BVMAP_TILE_URL]);
    expect(src.minzoom).toBe(4);
    expect(src.maxzoom).toBe(16);
    expect(src.attribution).toBe(GSI_ATTRIBUTION);
  });
});

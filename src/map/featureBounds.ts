import type { Geometry, Position } from "geojson";

/**
 * GSI 由来の feature 群の経度緯度 BBox を扱う純関数群。#33
 *
 * - `geometryBounds`: 単一 geometry の lng-lat 範囲。
 * - `unionBounds`: 複数 BBox の合成。
 * - `expandBoundsByFactor`: 中心を保ったまま縦横を `factor` 倍に拡張。
 *   factor=2 のとき面積 4 倍（辺は各 2 倍）。
 */

export type LngLatBounds = readonly [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

function extendByPosition(b: number[], p: Position): void {
  const lng = p[0]!;
  const lat = p[1]!;
  if (lng < b[0]!) b[0] = lng;
  if (lat < b[1]!) b[1] = lat;
  if (lng > b[2]!) b[2] = lng;
  if (lat > b[3]!) b[3] = lat;
}

function extendByPositions(b: number[], coords: Position[]): void {
  for (const c of coords) extendByPosition(b, c);
}

/** 単一 geometry の lng-lat BBox。空 / 不明な geometry は null。 */
export function geometryBounds(g: Geometry): LngLatBounds | null {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  switch (g.type) {
    case "Point":
      extendByPosition(b, g.coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      extendByPositions(b, g.coordinates);
      break;
    case "MultiLineString":
    case "Polygon":
      for (const line of g.coordinates) extendByPositions(b, line);
      break;
    case "MultiPolygon":
      for (const poly of g.coordinates) {
        for (const ring of poly) extendByPositions(b, ring);
      }
      break;
    case "GeometryCollection": {
      let any = false;
      for (const child of g.geometries) {
        const cb = geometryBounds(child);
        if (!cb) continue;
        any = true;
        if (cb[0] < b[0]!) b[0] = cb[0];
        if (cb[1] < b[1]!) b[1] = cb[1];
        if (cb[2] > b[2]!) b[2] = cb[2];
        if (cb[3] > b[3]!) b[3] = cb[3];
      }
      if (!any) return null;
      break;
    }
    default:
      return null;
  }
  if (!Number.isFinite(b[0]) || !Number.isFinite(b[2])) return null;
  return [b[0]!, b[1]!, b[2]!, b[3]!] as const;
}

/** 複数 BBox の合成（min/min/max/max）。空配列なら null。 */
export function unionBounds(list: ReadonlyArray<LngLatBounds>): LngLatBounds | null {
  if (list.length === 0) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const b of list) {
    if (b[0] < minLng) minLng = b[0];
    if (b[1] < minLat) minLat = b[1];
    if (b[2] > maxLng) maxLng = b[2];
    if (b[3] > maxLat) maxLat = b[3];
  }
  return [minLng, minLat, maxLng, maxLat] as const;
}

/**
 * 中心を保ったまま縦横を `factor` 倍に拡張した BBox。
 * factor=1 で同じ、factor=2 で各辺 2 倍（面積 4 倍）。
 *
 * 退化 BBox（点や線で width/height が 0）の場合も中心を保つだけで増えない。
 * 必要なら呼び出し側で min size を加える。
 */
export function expandBoundsByFactor(b: LngLatBounds, factor: number): LngLatBounds {
  const [minLng, minLat, maxLng, maxLat] = b;
  const cx = (minLng + maxLng) / 2;
  const cy = (minLat + maxLat) / 2;
  const halfW = ((maxLng - minLng) * factor) / 2;
  const halfH = ((maxLat - minLat) * factor) / 2;
  return [cx - halfW, cy - halfH, cx + halfW, cy + halfH] as const;
}

import type { Geometry, Position } from "geojson";

/**
 * クリック選択のヒット許容半径（スクリーン px）。
 * 0 px（=線芯の真上）だと線系 feature の選択が極端に難しくなるため、
 * 半径内に入っている最寄り feature を選ぶ運用にする。#30
 */
export const SELECTION_HIT_RADIUS_PX = 6;

export interface ScreenPoint {
  x: number;
  y: number;
}

/** lng/lat (Position の先頭 2 要素) を screen 座標に投影する関数型。 */
export type ProjectFn = (lng: number, lat: number) => ScreenPoint;

/** 2 点間のユークリッド距離（px）。 */
function dist(a: ScreenPoint, b: ScreenPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** 点 p から線分 a-b までの最短距離（px）。 */
export function pointToSegmentDistance(
  p: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * vx, y: a.y + t * vy });
}

/** 折れ線（2 点以上）までの最短距離。点が 1 つ以下なら点までの距離にフォールバック。 */
function distanceToLineScreen(p: ScreenPoint, pts: ScreenPoint[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return dist(p, pts[0]!);
  let min = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = pointToSegmentDistance(p, pts[i]!, pts[i + 1]!);
    if (d < min) min = d;
  }
  return min;
}

/** screen 座標の ring（閉環）に対し、点 p が内部にあるか（ray casting）。 */
function pointInRingScreen(p: ScreenPoint, ring: ScreenPoint[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i]!.x;
    const yi = ring[i]!.y;
    const xj = ring[j]!.x;
    const yj = ring[j]!.y;
    const intersects =
      yi > p.y !== yj > p.y &&
      p.x < ((xj - xi) * (p.y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** screen 座標の ring の各辺までの最短距離。 */
function distanceToRingScreen(p: ScreenPoint, ring: ScreenPoint[]): number {
  if (ring.length < 2) return Infinity;
  return distanceToLineScreen(p, ring);
}

function projectLine(coords: Position[], project: ProjectFn): ScreenPoint[] {
  const out: ScreenPoint[] = [];
  for (const c of coords) {
    out.push(project(c[0]!, c[1]!));
  }
  return out;
}

/**
 * 点 p から GeoJSON geometry までの screen 距離（px）。
 * - Point: 点までの距離
 * - LineString: セグメントまでの最短距離
 * - Polygon: 内部なら 0、外なら最近接辺までの距離（内孔は考慮しない）
 * - Multi*: 各部分の最小値
 * - GeometryCollection: 各要素の最小値
 */
export function screenDistanceToFeature(
  p: ScreenPoint,
  geom: Geometry,
  project: ProjectFn,
): number {
  switch (geom.type) {
    case "Point": {
      return dist(p, project(geom.coordinates[0]!, geom.coordinates[1]!));
    }
    case "MultiPoint": {
      let min = Infinity;
      for (const c of geom.coordinates) {
        const d = dist(p, project(c[0]!, c[1]!));
        if (d < min) min = d;
      }
      return min;
    }
    case "LineString": {
      return distanceToLineScreen(p, projectLine(geom.coordinates, project));
    }
    case "MultiLineString": {
      let min = Infinity;
      for (const line of geom.coordinates) {
        const d = distanceToLineScreen(p, projectLine(line, project));
        if (d < min) min = d;
      }
      return min;
    }
    case "Polygon": {
      const rings = geom.coordinates.map((r) => projectLine(r, project));
      if (rings.length === 0) return Infinity;
      if (pointInRingScreen(p, rings[0]!)) return 0;
      let min = Infinity;
      for (const r of rings) {
        const d = distanceToRingScreen(p, r);
        if (d < min) min = d;
      }
      return min;
    }
    case "MultiPolygon": {
      let min = Infinity;
      for (const poly of geom.coordinates) {
        const rings = poly.map((r) => projectLine(r, project));
        if (rings.length === 0) continue;
        if (pointInRingScreen(p, rings[0]!)) return 0;
        for (const r of rings) {
          const d = distanceToRingScreen(p, r);
          if (d < min) min = d;
        }
      }
      return min;
    }
    case "GeometryCollection": {
      let min = Infinity;
      for (const g of geom.geometries) {
        const d = screenDistanceToFeature(p, g, project);
        if (d < min) min = d;
      }
      return min;
    }
    default:
      return Infinity;
  }
}

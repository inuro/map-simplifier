import type { Geometry, Position } from "geojson";
import {
  pointToSegmentDistance,
  type ProjectFn,
  type ScreenPoint,
} from "./featureDistance";

/**
 * 「選択以外を削除」で、選択 feature と同じ論理 feature のタイル分割片だけを保護する。
 *
 * properties 完全一致だけでは `BldA { vt_code: 3111 }` のような汎用属性を持つ
 * 無関係な建物まで保護してしまうため、同一属性に加えて「現在の source tile 境界上で
 * geometry が接続している」ことを条件にする。
 */

export interface FeatureIdentityInput {
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

interface ScreenBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ProjectedPoint extends ScreenPoint {
  nearTileBoundary: boolean;
}

interface ProjectedPath {
  points: ProjectedPoint[];
}

interface ProjectedGeometry {
  bounds: ScreenBounds | null;
  hasTileBoundaryPoint: boolean;
  paths: ProjectedPath[];
}

interface FeatureDescriptor {
  key: string;
  propsKey: string;
  projected: ProjectedGeometry;
}

export const PARTIAL_PROTECTION_MARGIN_PX = 4;
const TILE_BOUNDARY_EPSILON = 0.001;
const GSI_SOURCE_MIN_ZOOM = 4;
const GSI_SOURCE_MAX_ZOOM = 16;

export function stableStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  const pairs = Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`);
  return `{${pairs.join(",")}}`;
}

export function featureGeometryKey(f: Pick<FeatureIdentityInput, "sourceLayer" | "geometry">): string {
  return `${f.sourceLayer}::${JSON.stringify(f.geometry)}`;
}

export function featurePropertiesKey(f: Pick<FeatureIdentityInput, "sourceLayer" | "properties">): string {
  return `${f.sourceLayer}::${stableStringify(f.properties)}`;
}

export function sourceTileZoomCandidates(
  mapZoom: number,
  minZoom = GSI_SOURCE_MIN_ZOOM,
  maxZoom = GSI_SOURCE_MAX_ZOOM,
): number[] {
  if (!Number.isFinite(mapZoom)) return [maxZoom];
  const out: number[] = [];
  for (const z of [Math.floor(mapZoom), Math.ceil(mapZoom)]) {
    const clamped = Math.max(minZoom, Math.min(maxZoom, z));
    if (!out.includes(clamped)) out.push(clamped);
  }
  return out;
}

function distanceToNearestInteger(v: number): number {
  return Math.abs(v - Math.round(v));
}

function tileX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * 2 ** zoom;
}

function tileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

function isNearTileBoundary(
  p: Position,
  sourceZooms: ReadonlyArray<number>,
  epsilon = TILE_BOUNDARY_EPSILON,
): boolean {
  const lng = p[0];
  const lat = p[1];
  if (typeof lng !== "number" || typeof lat !== "number") return false;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;

  for (const z of sourceZooms) {
    const x = tileX(lng, z);
    const y = tileY(lat, z);
    if (distanceToNearestInteger(x) <= epsilon) return true;
    if (distanceToNearestInteger(y) <= epsilon) return true;
  }
  return false;
}

function extendBounds(bounds: ScreenBounds | null, p: ScreenPoint): ScreenBounds {
  if (!bounds) return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
  return {
    minX: Math.min(bounds.minX, p.x),
    minY: Math.min(bounds.minY, p.y),
    maxX: Math.max(bounds.maxX, p.x),
    maxY: Math.max(bounds.maxY, p.y),
  };
}

function projectPosition(
  p: Position,
  project: ProjectFn,
  sourceZooms: ReadonlyArray<number>,
): ProjectedPoint | null {
  const lng = p[0];
  const lat = p[1];
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const screen = project(lng, lat);
  if (!Number.isFinite(screen.x) || !Number.isFinite(screen.y)) return null;
  return {
    x: screen.x,
    y: screen.y,
    nearTileBoundary: isNearTileBoundary(p, sourceZooms),
  };
}

function addPath(
  coords: Position[],
  project: ProjectFn,
  sourceZooms: ReadonlyArray<number>,
  paths: ProjectedPath[],
  currentBounds: ScreenBounds | null,
): { bounds: ScreenBounds | null; hasTileBoundaryPoint: boolean } {
  const points: ProjectedPoint[] = [];
  let bounds = currentBounds;
  let hasTileBoundaryPoint = false;

  for (const c of coords) {
    const p = projectPosition(c, project, sourceZooms);
    if (!p) continue;
    points.push(p);
    bounds = extendBounds(bounds, p);
    hasTileBoundaryPoint ||= p.nearTileBoundary;
  }

  if (points.length > 0) paths.push({ points });
  return { bounds, hasTileBoundaryPoint };
}

function projectGeometry(
  geometry: Geometry,
  project: ProjectFn,
  sourceZooms: ReadonlyArray<number>,
): ProjectedGeometry {
  const paths: ProjectedPath[] = [];
  let bounds: ScreenBounds | null = null;
  let hasTileBoundaryPoint = false;

  const merge = (result: { bounds: ScreenBounds | null; hasTileBoundaryPoint: boolean }) => {
    bounds = result.bounds;
    hasTileBoundaryPoint ||= result.hasTileBoundaryPoint;
  };

  const visit = (g: Geometry): void => {
    switch (g.type) {
      case "Point":
        merge(addPath([g.coordinates], project, sourceZooms, paths, bounds));
        break;
      case "MultiPoint":
      case "LineString":
        merge(addPath(g.coordinates, project, sourceZooms, paths, bounds));
        break;
      case "MultiLineString":
      case "Polygon":
        for (const line of g.coordinates) {
          merge(addPath(line, project, sourceZooms, paths, bounds));
        }
        break;
      case "MultiPolygon":
        for (const polygon of g.coordinates) {
          for (const ring of polygon) {
            merge(addPath(ring, project, sourceZooms, paths, bounds));
          }
        }
        break;
      case "GeometryCollection":
        for (const child of g.geometries) visit(child);
        break;
      default:
        break;
    }
  };

  visit(geometry);
  return { bounds, hasTileBoundaryPoint, paths };
}

function screenBoundsDistance(a: ScreenBounds, b: ScreenBounds): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

function dist(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cross(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function isOnSegment(a: ScreenPoint, b: ScreenPoint, p: ScreenPoint): boolean {
  const eps = 1e-9;
  return (
    Math.abs(cross(a, b, p)) <= eps &&
    p.x >= Math.min(a.x, b.x) - eps &&
    p.x <= Math.max(a.x, b.x) + eps &&
    p.y >= Math.min(a.y, b.y) - eps &&
    p.y <= Math.max(a.y, b.y) + eps
  );
}

function segmentsIntersect(
  a1: ScreenPoint,
  a2: ScreenPoint,
  b1: ScreenPoint,
  b2: ScreenPoint,
): boolean {
  const d1 = cross(a1, a2, b1);
  const d2 = cross(a1, a2, b2);
  const d3 = cross(b1, b2, a1);
  const d4 = cross(b1, b2, a2);

  if (d1 === 0 && isOnSegment(a1, a2, b1)) return true;
  if (d2 === 0 && isOnSegment(a1, a2, b2)) return true;
  if (d3 === 0 && isOnSegment(b1, b2, a1)) return true;
  if (d4 === 0 && isOnSegment(b1, b2, a2)) return true;
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

function segmentDistance(
  a1: ScreenPoint,
  a2: ScreenPoint,
  b1: ScreenPoint,
  b2: ScreenPoint,
): number {
  if (segmentsIntersect(a1, a2, b1, b2)) return 0;
  return Math.min(
    pointToSegmentDistance(a1, b1, b2),
    pointToSegmentDistance(a2, b1, b2),
    pointToSegmentDistance(b1, a1, a2),
    pointToSegmentDistance(b2, a1, a2),
  );
}

function hasNearTileBoundaryContact(
  a: ProjectedGeometry,
  b: ProjectedGeometry,
  marginPx: number,
): boolean {
  if (!a.hasTileBoundaryPoint || !b.hasTileBoundaryPoint) return false;

  for (const ap of a.paths) {
    for (const bp of b.paths) {
      for (const p of ap.points) {
        if (!p.nearTileBoundary) continue;
        for (const q of bp.points) {
          if (q.nearTileBoundary && dist(p, q) <= marginPx) return true;
        }
      }

      for (let i = 0; i < ap.points.length - 1; i++) {
        const a1 = ap.points[i]!;
        const a2 = ap.points[i + 1]!;
        const aSegmentOnBoundary = a1.nearTileBoundary && a2.nearTileBoundary;

        for (let j = 0; j < bp.points.length - 1; j++) {
          const b1 = bp.points[j]!;
          const b2 = bp.points[j + 1]!;
          const bSegmentOnBoundary = b1.nearTileBoundary && b2.nearTileBoundary;

          if (
            aSegmentOnBoundary &&
            bSegmentOnBoundary &&
            segmentDistance(a1, a2, b1, b2) <= marginPx
          ) {
            return true;
          }

          if (
            aSegmentOnBoundary &&
            ((b1.nearTileBoundary && pointToSegmentDistance(b1, a1, a2) <= marginPx) ||
              (b2.nearTileBoundary && pointToSegmentDistance(b2, a1, a2) <= marginPx))
          ) {
            return true;
          }

          if (
            bSegmentOnBoundary &&
            ((a1.nearTileBoundary && pointToSegmentDistance(a1, b1, b2) <= marginPx) ||
              (a2.nearTileBoundary && pointToSegmentDistance(a2, b1, b2) <= marginPx))
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function areProjectedTileSplitParts(
  a: ProjectedGeometry,
  b: ProjectedGeometry,
  marginPx: number,
): boolean {
  if (!a.bounds || !b.bounds) return false;
  if (screenBoundsDistance(a.bounds, b.bounds) > marginPx) return false;
  return hasNearTileBoundaryContact(a, b, marginPx);
}

function buildDescriptor(
  feature: FeatureIdentityInput,
  project: ProjectFn,
  sourceZooms: ReadonlyArray<number>,
): FeatureDescriptor {
  return {
    key: featureGeometryKey(feature),
    propsKey: featurePropertiesKey(feature),
    projected: projectGeometry(feature.geometry, project, sourceZooms),
  };
}

export function areLikelyTileSplitParts(
  a: FeatureIdentityInput,
  b: FeatureIdentityInput,
  project: ProjectFn,
  sourceZooms: ReadonlyArray<number>,
  marginPx = PARTIAL_PROTECTION_MARGIN_PX,
): boolean {
  if (a.sourceLayer !== b.sourceLayer) return false;
  if (featurePropertiesKey(a) !== featurePropertiesKey(b)) return false;
  const ad = buildDescriptor(a, project, sourceZooms);
  const bd = buildDescriptor(b, project, sourceZooms);
  return areProjectedTileSplitParts(ad.projected, bd.projected, marginPx);
}

export function protectedFeatureKeysForInverseDelete({
  selected,
  candidates,
  project,
  sourceZooms,
  marginPx = PARTIAL_PROTECTION_MARGIN_PX,
}: {
  selected: ReadonlyArray<FeatureIdentityInput>;
  candidates: ReadonlyArray<FeatureIdentityInput>;
  project: ProjectFn;
  sourceZooms: ReadonlyArray<number>;
  marginPx?: number;
}): Set<string> {
  const protectedKeys = new Set<string>();
  const protectedByProps = new Map<string, FeatureDescriptor[]>();

  const addProtected = (descriptor: FeatureDescriptor): void => {
    if (protectedKeys.has(descriptor.key)) return;
    protectedKeys.add(descriptor.key);
    const list = protectedByProps.get(descriptor.propsKey);
    if (list) list.push(descriptor);
    else protectedByProps.set(descriptor.propsKey, [descriptor]);
  };

  for (const f of selected) {
    addProtected(buildDescriptor(f, project, sourceZooms));
  }

  const candidateDescriptors = candidates.map((f) => buildDescriptor(f, project, sourceZooms));
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of candidateDescriptors) {
      if (protectedKeys.has(candidate.key)) continue;
      const protectedGroup = protectedByProps.get(candidate.propsKey);
      if (!protectedGroup) continue;
      if (
        protectedGroup.some((protectedFeature) =>
          areProjectedTileSplitParts(candidate.projected, protectedFeature.projected, marginPx),
        )
      ) {
        addProtected(candidate);
        changed = true;
      }
    }
  }

  return protectedKeys;
}

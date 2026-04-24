import type { LngLat } from "./viewState";

const NUMERIC_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseLatLngInput(raw: string): LngLat | null {
  const normalized = raw.trim().replace(/[，、]/g, ",");
  if (!normalized) return null;

  const parts = normalized.includes(",")
    ? normalized.split(",").map((s) => s.trim())
    : normalized.split(/\s+/);
  if (parts.length !== 2) return null;
  if (!parts.every((p) => NUMERIC_TOKEN.test(p))) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function formatLatLng(v: LngLat, precision = 5): string {
  return `${v.lat.toFixed(precision)}, ${v.lng.toFixed(precision)}`;
}

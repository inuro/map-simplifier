export interface LngLat {
  lng: number;
  lat: number;
}

export interface ViewState {
  center: LngLat;
  zoom: number;
}

export const DEFAULT_VIEW: ViewState = {
  center: { lng: 139.767, lat: 35.681 },
  zoom: 13,
};

export function encodeViewToHash(v: ViewState): string {
  const z = v.zoom.toFixed(2);
  const lat = v.center.lat.toFixed(5);
  const lng = v.center.lng.toFixed(5);
  return `#${z}/${lat}/${lng}`;
}

export function decodeHashToView(hash: string): ViewState | null {
  if (!hash || !hash.startsWith("#")) return null;
  const parts = hash.slice(1).split("/");
  if (parts.length !== 3) return null;
  const [zs, lats, lngs] = parts;
  const z = Number(zs);
  const lat = Number(lats);
  const lng = Number(lngs);
  if (!Number.isFinite(z) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (z < 0 || z > 22 || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { center: { lng, lat }, zoom: z };
}

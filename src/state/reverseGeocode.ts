import { formatLatLng } from "./latLngInput";
import type { LngLat } from "./viewState";

const GSI_REVERSE_GEOCODER_URL =
  "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";

interface GsiReverseGeocodeResponse {
  results?: {
    muniCd?: string;
    lv01Nm?: string;
  };
}

function timestampLabelPart(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`;
}

export async function reverseGeocodeGsi(
  center: LngLat,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = new URL(GSI_REVERSE_GEOCODER_URL);
  url.searchParams.set("lat", String(center.lat));
  url.searchParams.set("lon", String(center.lng));

  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const json = (await res.json()) as GsiReverseGeocodeResponse;
  const name = json.results?.lv01Nm?.trim();
  return name || null;
}

export async function suggestSnapshotLabel(
  center: LngLat,
  zoom: number,
  now = new Date(),
): Promise<string> {
  let place: string | null = null;
  try {
    place = await reverseGeocodeGsi(center);
  } catch {
    place = null;
  }
  const base = place ?? formatLatLng(center, 3);
  return `${base} Z${zoom.toFixed(2)} ${timestampLabelPart(now)}`;
}

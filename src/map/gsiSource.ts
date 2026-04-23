export const GSI_BVMAP_TILE_URL =
  "https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf";

export const GSI_ATTRIBUTION =
  '出典：<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル（国土地理院）</a>';

export interface GsiVectorSource {
  type: "vector";
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  attribution: string;
}

export function buildGsiVectorSource(): GsiVectorSource {
  return {
    type: "vector",
    tiles: [GSI_BVMAP_TILE_URL],
    minzoom: 4,
    maxzoom: 16,
    attribution: GSI_ATTRIBUTION,
  };
}

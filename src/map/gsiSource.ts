import { toProtocolUrl } from "./idProtocol";

/**
 * 実タイル URL（国土地理院 optimal_bvmap-v1）。
 * MapLibre にそのまま渡すと素の pbf（feature.id 無し）になるので、
 * 本アプリでは `gsi-ids://...` プロトコル経由で id 注入した pbf を読む。
 */
export const GSI_BVMAP_TILE_URL =
  "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf";

/** 実 URL を `gsi-ids://` プロトコルに包んだ source 用 URL。 */
export const GSI_BVMAP_TILE_URL_WITH_IDS = toProtocolUrl(GSI_BVMAP_TILE_URL);

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
    tiles: [GSI_BVMAP_TILE_URL_WITH_IDS],
    minzoom: 4,
    maxzoom: 16,
    attribution: GSI_ATTRIBUTION,
  };
}

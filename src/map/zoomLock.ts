import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * 編集中のズーム変更を抑止するためのロック制御。#35
 *
 * GSI ベクトルタイルにはズーム段を跨いだグローバル feature ID が無く、内部では
 * `(sourceLayer + geometry deep-equal)` も併用して同一性判定している。整数ズームを
 * 跨ぐと同じ論理 feature でも geometry が simplify されて別物になり、
 * editState.hidden の登録とまったくマッチしなくなるため、編集中は整数ズーム段を固定する。
 *
 * setMinZoom / setMaxZoom を現在ズームの整数帯に揃えることで、scroll / dblclick / pinch /
 * NavigationControl の +/- など全経路を抑制する（MapLibre の仕様）。
 */

const ZOOM_TILE_BAND_UPPER_EPSILON = 1e-6;

export interface ZoomLockSnapshot {
  minZoom: number;
  maxZoom: number;
}

export interface ZoomLockRange {
  minZoom: number;
  maxZoom: number;
}

/**
 * 現在ズームを含む整数ズーム帯を返す。
 *
 * 例: 16.35 のとき 16.0 <= z < 17.0 を許可する。MapLibre の maxZoom は
 * inclusive 扱いなので、上限は次の整数から微小値だけ引いて整数段跨ぎを防ぐ。
 */
export function tileZoomBandFor(
  zoom: number,
  bounds: ZoomLockSnapshot,
): ZoomLockRange {
  const tileZoom = Math.floor(zoom);
  const bandMin = tileZoom;
  const bandMax = tileZoom + 1 - ZOOM_TILE_BAND_UPPER_EPSILON;
  return {
    minZoom: Math.max(bounds.minZoom, bandMin),
    maxZoom: Math.min(bounds.maxZoom, bandMax),
  };
}

/** ロック前の min/max を返し、現行ズームの整数帯に固定する。 */
export function lockZoom(map: MapLibreMap): ZoomLockSnapshot {
  const before: ZoomLockSnapshot = {
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
  };
  const range = tileZoomBandFor(map.getZoom(), before);
  map.setMinZoom(range.minZoom);
  map.setMaxZoom(range.maxZoom);
  return before;
}

/** snapshot の値で min/max を戻す。 */
export function unlockZoom(map: MapLibreMap, prev: ZoomLockSnapshot): void {
  map.setMinZoom(prev.minZoom);
  map.setMaxZoom(prev.maxZoom);
}

/** UI 表示用：ズームを少数 2 桁で `Z 15.32` 形式に整形。 */
export function formatZoomDisplay(zoom: number, locked: boolean): string {
  const z = zoom.toFixed(2);
  return locked ? `Z ${z} 🔒` : `Z ${z}`;
}

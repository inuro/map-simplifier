import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * 編集中のズーム変更を抑止するためのロック制御。#35
 *
 * GSI ベクトルタイルにはグローバル feature ID が無く、内部では
 * `(sourceLayer + geometry deep-equal)` で同一性判定している。ズームを跨ぐと
 * 同じ論理 feature でも geometry が simplify されて別物になり、
 * editState.hidden の登録とまったくマッチしなくなるため、編集中はズーム固定が安全。
 *
 * setMinZoom / setMaxZoom を現在ズームに揃えることで、scroll / dblclick / pinch /
 * NavigationControl の +/- など全経路を抑制する（MapLibre の仕様）。
 */

export interface ZoomLockSnapshot {
  minZoom: number;
  maxZoom: number;
}

/** ロック前の min/max を返し、現行ズームに固定する。 */
export function lockZoom(map: MapLibreMap): ZoomLockSnapshot {
  const before: ZoomLockSnapshot = {
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
  };
  const z = map.getZoom();
  map.setMinZoom(z);
  map.setMaxZoom(z);
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

import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { PALETTES, type Preset } from "./style";

/**
 * 非表示にされた feature を覆い隠すオーバレイ。
 * GeoJSON source + mask layer (polygon/line/point) を map に差し込み、
 * 現在の preset の背景色で元 feature を上書きする。
 *
 * preset 切替時は base style を setStyle で入れ替えるが、本オーバレイは
 * 明示的に style.load で再適用する（setStyle の diff ではカスタム source/layer は
 * 基本的に残るが、確実性のため毎回 ensureHiddenOverlay() を呼ぶ）。
 */

export const HIDDEN_SOURCE_ID = "hidden-overlay";
export const HIDDEN_LAYER_IDS = {
  polygon: "hidden-polygon-mask",
  line: "hidden-line-mask",
  point: "hidden-point-mask",
} as const;

// 「ユーザが非表示にしたい」候補レイヤの style layer id。
// bg（背景）と overlay 自身は除外。
export const HIDEABLE_LAYER_IDS: readonly string[] = [
  "waterarea-fill",
  "wstructurea-fill",
  "river-line",
  "railway-line",
  "road-line",
  "building-fill",
  "boundary-line",
];

export function ensureHiddenOverlay(
  map: MapLibreMap,
  preset: Preset,
  data: FeatureCollection,
): void {
  const bg = PALETTES[preset].bg;

  if (!map.getSource(HIDDEN_SOURCE_ID)) {
    map.addSource(HIDDEN_SOURCE_ID, {
      type: "geojson",
      data,
    });
  } else {
    (map.getSource(HIDDEN_SOURCE_ID) as GeoJSONSource).setData(data);
  }

  if (!map.getLayer(HIDDEN_LAYER_IDS.polygon)) {
    map.addLayer({
      id: HIDDEN_LAYER_IDS.polygon,
      type: "fill",
      source: HIDDEN_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": bg, "fill-opacity": 1 },
    });
  } else {
    map.setPaintProperty(HIDDEN_LAYER_IDS.polygon, "fill-color", bg);
  }

  if (!map.getLayer(HIDDEN_LAYER_IDS.line)) {
    map.addLayer({
      id: HIDDEN_LAYER_IDS.line,
      type: "line",
      source: HIDDEN_SOURCE_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": bg,
        // 原線より太く覆う（ズームに応じて拡張）。書籍用途では完全に消したいので広めに。
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          4,
          14,
          8,
          16,
          14,
        ],
      },
    });
  } else {
    map.setPaintProperty(HIDDEN_LAYER_IDS.line, "line-color", bg);
  }

  if (!map.getLayer(HIDDEN_LAYER_IDS.point)) {
    map.addLayer({
      id: HIDDEN_LAYER_IDS.point,
      type: "circle",
      source: HIDDEN_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": bg,
        "circle-radius": 10,
        "circle-stroke-width": 0,
      },
    });
  } else {
    map.setPaintProperty(HIDDEN_LAYER_IDS.point, "circle-color", bg);
  }
}

export function setHiddenOverlayData(map: MapLibreMap, data: FeatureCollection): void {
  const src = map.getSource(HIDDEN_SOURCE_ID);
  if (src && "setData" in src) {
    (src as GeoJSONSource).setData(data);
  }
}

import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { PALETTES, type Preset } from "./style";

/**
 * 強調中 feature の視覚表現。preset ごとに色を切り替える
 * （standard: 赤 / mono: 黒）。
 *
 * 塗り＋縁取りで「強調されている」ことが紙面でも判る強度を出す。
 * なお「非表示」側は feature-state（opacity 0）で実現するため、
 * 強調 overlay と重なり順を気にする必要はない（#26）。
 */

export const HIGHLIGHT_SOURCE_ID = "highlight-overlay";
export const HIGHLIGHT_LAYER_IDS = {
  polygonFill: "highlight-polygon-fill",
  polygonStroke: "highlight-polygon-stroke",
  line: "highlight-line",
  point: "highlight-point",
} as const;

export function ensureHighlightOverlay(
  map: MapLibreMap,
  preset: Preset,
  data: FeatureCollection,
): void {
  const { highlightFill, highlightStroke, highlightFillOpacity } = PALETTES[preset];

  if (!map.getSource(HIGHLIGHT_SOURCE_ID)) {
    map.addSource(HIGHLIGHT_SOURCE_ID, { type: "geojson", data });
  } else {
    (map.getSource(HIGHLIGHT_SOURCE_ID) as GeoJSONSource).setData(data);
  }

  // polygon: 半透明塗り（opacity は preset に応じて切り替え）
  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.polygonFill)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.polygonFill,
      type: "fill",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": highlightFill,
        "fill-opacity": highlightFillOpacity,
      },
    });
  } else {
    map.setPaintProperty(HIGHLIGHT_LAYER_IDS.polygonFill, "fill-color", highlightFill);
    map.setPaintProperty(
      HIGHLIGHT_LAYER_IDS.polygonFill,
      "fill-opacity",
      highlightFillOpacity,
    );
  }

  // polygon: 縁取り
  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.polygonStroke)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.polygonStroke,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": highlightStroke,
        "line-width": 2,
      },
    });
  } else {
    map.setPaintProperty(HIGHLIGHT_LAYER_IDS.polygonStroke, "line-color", highlightStroke);
  }

  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.line)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.line,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": highlightStroke,
        "line-width": 5,
        "line-opacity": 0.9,
      },
    });
  } else {
    map.setPaintProperty(HIGHLIGHT_LAYER_IDS.line, "line-color", highlightStroke);
  }

  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.point)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.point,
      type: "circle",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": highlightStroke,
        "circle-radius": 8,
      },
    });
  } else {
    map.setPaintProperty(HIGHLIGHT_LAYER_IDS.point, "circle-color", highlightStroke);
  }
}

export function setHighlightOverlayData(map: MapLibreMap, data: FeatureCollection): void {
  const src = map.getSource(HIGHLIGHT_SOURCE_ID);
  if (src && "setData" in src) {
    (src as GeoJSONSource).setData(data);
  }
}

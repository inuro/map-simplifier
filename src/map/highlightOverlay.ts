import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

/**
 * 強調中 feature の視覚表現。preset 非依存の固定色 (#d93b3b)。
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

export const HIGHLIGHT_COLOR = "#d93b3b";

export function ensureHighlightOverlay(map: MapLibreMap, data: FeatureCollection): void {
  if (!map.getSource(HIGHLIGHT_SOURCE_ID)) {
    map.addSource(HIGHLIGHT_SOURCE_ID, { type: "geojson", data });
  } else {
    (map.getSource(HIGHLIGHT_SOURCE_ID) as GeoJSONSource).setData(data);
  }

  // polygon: 赤の半透明塗り
  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.polygonFill)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.polygonFill,
      type: "fill",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": HIGHLIGHT_COLOR,
        "fill-opacity": 0.35,
      },
    });
  }
  // polygon: 赤の縁取り
  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.polygonStroke)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.polygonStroke,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": HIGHLIGHT_COLOR,
        "line-width": 2,
      },
    });
  }
  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.line)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.line,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": HIGHLIGHT_COLOR,
        "line-width": 5,
        "line-opacity": 0.9,
      },
    });
  }
  if (!map.getLayer(HIGHLIGHT_LAYER_IDS.point)) {
    map.addLayer({
      id: HIGHLIGHT_LAYER_IDS.point,
      type: "circle",
      source: HIGHLIGHT_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": HIGHLIGHT_COLOR,
        "circle-radius": 8,
      },
    });
  }
}

export function setHighlightOverlayData(map: MapLibreMap, data: FeatureCollection): void {
  const src = map.getSource(HIGHLIGHT_SOURCE_ID);
  if (src && "setData" in src) {
    (src as GeoJSONSource).setData(data);
  }
}

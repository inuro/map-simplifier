import type { FeatureCollection } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

/**
 * 選択中 feature を視覚的に示すオーバレイ。
 * 橙色の「縁取り」レイヤ群として base style の上に積む。
 *
 * preset 非依存の固定色で、標準／モノトーンどちらでも視認できることを狙う。
 */

export const SELECTION_SOURCE_ID = "selection-overlay";
export const SELECTION_LAYER_IDS = {
  polygonStroke: "selection-polygon-stroke",
  line: "selection-line",
  point: "selection-point",
} as const;

const SELECTION_COLOR = "#ff8800";

export function ensureSelectionOverlay(map: MapLibreMap, data: FeatureCollection): void {
  if (!map.getSource(SELECTION_SOURCE_ID)) {
    map.addSource(SELECTION_SOURCE_ID, {
      type: "geojson",
      data,
    });
  } else {
    (map.getSource(SELECTION_SOURCE_ID) as GeoJSONSource).setData(data);
  }

  // Polygon: 塗りは薄い橙、境界線を太く強調
  if (!map.getLayer(SELECTION_LAYER_IDS.polygonStroke)) {
    map.addLayer({
      id: SELECTION_LAYER_IDS.polygonStroke,
      type: "line",
      source: SELECTION_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": SELECTION_COLOR,
        "line-width": 3,
      },
    });
  }

  if (!map.getLayer(SELECTION_LAYER_IDS.line)) {
    map.addLayer({
      id: SELECTION_LAYER_IDS.line,
      type: "line",
      source: SELECTION_SOURCE_ID,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": SELECTION_COLOR,
        "line-width": 4,
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer(SELECTION_LAYER_IDS.point)) {
    map.addLayer({
      id: SELECTION_LAYER_IDS.point,
      type: "circle",
      source: SELECTION_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": "#ffffff",
        "circle-stroke-color": SELECTION_COLOR,
        "circle-stroke-width": 3,
        "circle-radius": 7,
      },
    });
  }
}

export function setSelectionOverlayData(map: MapLibreMap, data: FeatureCollection): void {
  const src = map.getSource(SELECTION_SOURCE_ID);
  if (src && "setData" in src) {
    (src as GeoJSONSource).setData(data);
  }
}

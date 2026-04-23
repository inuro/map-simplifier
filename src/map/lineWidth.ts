import type { Map as MapLibreMap } from "maplibre-gl";
import {
  BASE_BOUNDARY_WIDTH,
  BASE_RAILWAY_WIDTH,
  BASE_RIVER_WIDTH,
  BASE_ROAD_WIDTH,
} from "./style";
import {
  scaleLineWidth,
  type LineWidthFactors,
} from "../state/lineWidthStore";

/**
 * LineWidthFactors を MapLibre の paint プロパティに反映。
 * preset 切替後（styledata）にも呼び出して再適用する。
 */
export function applyLineWidthFactors(
  map: MapLibreMap,
  factors: LineWidthFactors,
): void {
  if (map.getLayer("road-line")) {
    map.setPaintProperty(
      "road-line",
      "line-width",
      scaleLineWidth(BASE_ROAD_WIDTH as unknown as unknown[], factors.road) as
        | number
        | unknown[],
    );
  }
  if (map.getLayer("railway-line")) {
    map.setPaintProperty(
      "railway-line",
      "line-width",
      scaleLineWidth(BASE_RAILWAY_WIDTH, factors.railway) as number,
    );
  }
  if (map.getLayer("river-line")) {
    map.setPaintProperty(
      "river-line",
      "line-width",
      scaleLineWidth(BASE_RIVER_WIDTH, factors.river) as number,
    );
  }
  if (map.getLayer("boundary-line")) {
    map.setPaintProperty(
      "boundary-line",
      "line-width",
      scaleLineWidth(BASE_BOUNDARY_WIDTH, factors.boundary) as number,
    );
  }
}

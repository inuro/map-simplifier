import type { Map as MapLibreMap } from "maplibre-gl";
import {
  BASE_BOUNDARY_WIDTH,
  BASE_BUILDING_OUTLINE_WIDTH,
  BASE_RAIL_TRACK_WIDTH,
  BASE_RAILWAY_WIDTH,
  BASE_RIVER_WIDTH,
  BASE_ROAD_COMPONENT_WIDTH,
  BASE_ROAD_EDGE_WIDTH,
  BASE_ROAD_WIDTH,
  BASE_WATERAREA_OUTLINE_WIDTH,
  BASE_WATERLINE_WIDTH,
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
  if (map.getLayer("waterarea-outline-line")) {
    map.setPaintProperty(
      "waterarea-outline-line",
      "line-width",
      scaleLineWidth(BASE_WATERAREA_OUTLINE_WIDTH, factors.water) as number,
    );
  }
  if (map.getLayer("waterline-line")) {
    map.setPaintProperty(
      "waterline-line",
      "line-width",
      scaleLineWidth(BASE_WATERLINE_WIDTH, factors.water) as number,
    );
  }
  if (map.getLayer("river-line")) {
    map.setPaintProperty(
      "river-line",
      "line-width",
      scaleLineWidth(BASE_RIVER_WIDTH, factors.water) as number,
    );
  }
  if (map.getLayer("road-line")) {
    map.setPaintProperty(
      "road-line",
      "line-width",
      scaleLineWidth(BASE_ROAD_WIDTH as unknown as unknown[], factors.road) as
        | number
        | unknown[],
    );
  }
  if (map.getLayer("road-edge-line")) {
    map.setPaintProperty(
      "road-edge-line",
      "line-width",
      scaleLineWidth(BASE_ROAD_EDGE_WIDTH, factors.roadEdge) as number,
    );
  }
  if (map.getLayer("road-component-line")) {
    map.setPaintProperty(
      "road-component-line",
      "line-width",
      scaleLineWidth(BASE_ROAD_COMPONENT_WIDTH, factors.roadEdge) as number,
    );
  }
  if (map.getLayer("railway-line")) {
    map.setPaintProperty(
      "railway-line",
      "line-width",
      scaleLineWidth(BASE_RAILWAY_WIDTH, factors.railway) as number,
    );
  }
  if (map.getLayer("rail-track-line")) {
    map.setPaintProperty(
      "rail-track-line",
      "line-width",
      scaleLineWidth(BASE_RAIL_TRACK_WIDTH, factors.railway) as number,
    );
  }
  if (map.getLayer("building-outline-line")) {
    map.setPaintProperty(
      "building-outline-line",
      "line-width",
      scaleLineWidth(BASE_BUILDING_OUTLINE_WIDTH, factors.building) as number,
    );
  }
  if (map.getLayer("structure-outline-line")) {
    map.setPaintProperty(
      "structure-outline-line",
      "line-width",
      scaleLineWidth(BASE_BUILDING_OUTLINE_WIDTH, factors.building) as number,
    );
  }
  if (map.getLayer("boundary-line")) {
    map.setPaintProperty(
      "boundary-line",
      "line-width",
      scaleLineWidth(BASE_BOUNDARY_WIDTH, factors.boundary) as number,
    );
  }
  if (map.getLayer("adminarea-boundary-line")) {
    map.setPaintProperty(
      "adminarea-boundary-line",
      "line-width",
      scaleLineWidth(BASE_BOUNDARY_WIDTH, factors.boundary) as number,
    );
  }
}

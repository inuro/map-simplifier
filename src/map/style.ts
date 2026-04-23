import type { StyleSpecification } from "maplibre-gl";
import { buildGsiVectorSource, GSI_ATTRIBUTION } from "./gsiSource";

const SOURCE_ID = "gsi";

// 国土地理院 experimental_bvmap の実 source-layer 名。
// scripts/inspect-tile.mjs で実タイルから観測したもの。
//
//   waterarea  : Polygon    水域
//   river      : LineString 河川中心線
//   road       : LineString 道路
//   railway    : LineString 鉄道
//   building   : Polygon    建物
//   boundary   : LineString 行政界
//   other      : LineString その他境界/構造物
//   wstructurea: Polygon    水部構造物
//   transp     : Point      交通記号
//   symbol     : Point      記号
//   label      : Point      注記

export function buildBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: "simplemap-base",
    sources: {
      [SOURCE_ID]: buildGsiVectorSource(),
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": "#fafafa" },
      },
      {
        id: "waterarea-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "waterarea",
        paint: { "fill-color": "#d6e4ec" },
      },
      {
        id: "wstructurea-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "wstructurea",
        paint: { "fill-color": "#c8d7e0" },
      },
      {
        id: "river-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "river",
        paint: { "line-color": "#88a7b8", "line-width": 0.8 },
      },
      {
        id: "railway-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "railway",
        paint: { "line-color": "#666666", "line-width": 1.1 },
      },
      {
        id: "road-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "road",
        paint: {
          "line-color": "#bfbfbf",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            0.3,
            14,
            1.0,
            16,
            2.4,
          ],
        },
      },
      {
        id: "building-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "building",
        minzoom: 13,
        paint: { "fill-color": "#d8d3ca", "fill-outline-color": "#b5ae9f" },
      },
      {
        id: "boundary-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "boundary",
        paint: {
          "line-color": "#9a9a9a",
          "line-width": 0.5,
          "line-dasharray": [3, 2],
        },
      },
    ],
    metadata: { attribution: GSI_ATTRIBUTION },
  };
}

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

export const PRESETS = ["standard", "mono"] as const;
export type Preset = (typeof PRESETS)[number];

interface PresetPalette {
  bg: string;
  waterarea: string;
  wstructurea: string;
  river: string;
  railway: string;
  road: string;
  buildingFill: string;
  buildingOutline: string;
  boundary: string;
}

export const PALETTES: Record<Preset, PresetPalette> = {
  standard: {
    bg: "#fafafa",
    waterarea: "#d6e4ec",
    wstructurea: "#c8d7e0",
    river: "#88a7b8",
    railway: "#666666",
    road: "#bfbfbf",
    buildingFill: "#d8d3ca",
    buildingOutline: "#b5ae9f",
    boundary: "#9a9a9a",
  },
  // グレースケール簡略化。紙面（単色印刷）への馴染みを優先。
  // 鉄道を最も濃く、道路はやや薄く、水域は陰影で差をつける。
  mono: {
    bg: "#ffffff",
    waterarea: "#d6d6d6",
    wstructurea: "#c8c8c8",
    river: "#8a8a8a",
    railway: "#2a2a2a",
    road: "#6a6a6a",
    buildingFill: "#ebebeb",
    buildingOutline: "#b8b8b8",
    boundary: "#8a8a8a",
  },
};

export function buildBaseStyle(preset: Preset = "standard"): StyleSpecification {
  const c = PALETTES[preset];
  return {
    version: 8,
    name: `map-simplifier-${preset}`,
    sources: {
      [SOURCE_ID]: buildGsiVectorSource(),
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": c.bg },
      },
      {
        id: "waterarea-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "waterarea",
        paint: { "fill-color": c.waterarea },
      },
      {
        id: "wstructurea-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "wstructurea",
        paint: { "fill-color": c.wstructurea },
      },
      {
        id: "river-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "river",
        paint: { "line-color": c.river, "line-width": 0.8 },
      },
      {
        id: "railway-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "railway",
        paint: { "line-color": c.railway, "line-width": 1.1 },
      },
      {
        id: "road-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "road",
        paint: {
          "line-color": c.road,
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
        paint: {
          "fill-color": c.buildingFill,
          "fill-outline-color": c.buildingOutline,
        },
      },
      {
        id: "boundary-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "boundary",
        paint: {
          "line-color": c.boundary,
          "line-width": 0.5,
          "line-dasharray": [3, 2],
        },
      },
    ],
    metadata: { attribution: GSI_ATTRIBUTION },
  };
}

import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import { buildGsiVectorSource, GSI_ATTRIBUTION } from "./gsiSource";

const SOURCE_ID = "gsi";

// 国土地理院 optimal_bvmap-v1 の実 source-layer 名。
// scripts/inspect-tile.mjs で実タイルから観測したもの。
//
//   WA       : Polygon    水域
//   WL       : LineString 水涯線
//   RvrCL    : LineString 河川中心線
//   RdCL     : LineString 道路中心線
//   RdEdg    : LineString 道路縁
//   RdCompt  : LineString 道路構成線
//   RailCL   : LineString 鉄道中心線
//   RailTrCL : LineString 軌道中心線
//   BldA     : Polygon    建物
//   StrctArea: Polygon    構造物面
//   AdmBdry  : LineString 行政界
//   AdmArea  : Polygon    行政区域
//   Anno     : Point      注記（現時点では非表示）

export const PRESETS = ["standard", "mono"] as const;
export type Preset = (typeof PRESETS)[number];

/**
 * 「ユーザーが削除できる」対象となる style layer id。
 * 削除は feature-state `hidden=true` → opacity 0 で実現する（#26 で mask 方式から移行）。
 * 本 list は次の用途で参照される：
 *   - 各レイヤの paint に hidden=true 時に opacity 0 となる式を注入
 *   - クリック/ホバー時の queryRenderedFeatures の対象絞り込み
 *   - addProtocol 経由で tile.features に id を付けた後、feature-state を同期するターゲット決定
 */
export const HIDEABLE_LAYER_IDS = [
  "waterarea-fill",
  "waterarea-outline-line",
  "waterline-line",
  "river-line",
  "railway-line",
  "rail-track-line",
  "road-line",
  "road-edge-line",
  "road-component-line",
  "building-fill",
  "building-outline-line",
  "structure-fill",
  "structure-outline-line",
  "boundary-line",
  "adminarea-boundary-line",
] as const;

/** 各 hideable layer に feature-state=hidden のとき opacity 0 となる expression。 */
const HIDDEN_OPACITY_EXPR: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "hidden"], false],
  0,
  1,
];

interface PresetPalette {
  bg: string;
  waterarea: string;
  waterline: string;
  river: string;
  railway: string;
  road: string;
  roadEdge: string;
  roadComponent: string;
  buildingFill: string;
  buildingOutline: string;
  structureFill: string;
  boundary: string;
  /**
   * 強調 overlay の塗り色（半透明で重ねる）。
   * standard は視認性優先で赤系、mono は紙面ルックを崩さないため黒系。
   */
  highlightFill: string;
  /** 強調 overlay の縁取り／線／点の色。 */
  highlightStroke: string;
  /**
   * 強調 polygon の fill-opacity。standard は赤自体が彩度高いので 0.35 で十分、
   * mono は建物の地色が明るい（#ebebeb など）ため濃い目（0.55）にしないと
   * 「枠線だけ強調されてるように見える」不自然さが出る。
   */
  highlightFillOpacity: number;
}

/**
 * 基準となる line-width。runtime で factor 調整する #24 で参照される。
 * ここを単一の source of truth とする。
 */
export const BASE_ROAD_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  0.3,
  14,
  1.0,
  16,
  2.4,
] as const;
export const BASE_RAILWAY_WIDTH = 1.1;
export const BASE_RAIL_TRACK_WIDTH = 0.7;
export const BASE_RIVER_WIDTH = 0.8;
export const BASE_WATERAREA_OUTLINE_WIDTH = 0.5;
export const BASE_WATERLINE_WIDTH = 0.45;
export const BASE_ROAD_EDGE_WIDTH = 0.55;
export const BASE_ROAD_COMPONENT_WIDTH = 0.45;
export const BASE_BUILDING_OUTLINE_WIDTH = 0.55;
export const BASE_BOUNDARY_WIDTH = 0.5;

export const PALETTES: Record<Preset, PresetPalette> = {
  standard: {
    bg: "#fafafa",
    waterarea: "#d6e4ec",
    waterline: "#9eb9c7",
    river: "#88a7b8",
    railway: "#666666",
    road: "#bfbfbf",
    roadEdge: "#9f9a92",
    roadComponent: "#b7b1a8",
    buildingFill: "#d8d3ca",
    buildingOutline: "#b5ae9f",
    structureFill: "#ccc6bb",
    boundary: "#9a9a9a",
    // 赤系（#d93b3b）。カラー紙面／画面で最も素直に目立つ。
    highlightFill: "#d93b3b",
    highlightStroke: "#d93b3b",
    highlightFillOpacity: 0.35,
  },
  // グレースケール簡略化。紙面（単色印刷）への馴染みを優先。
  // 鉄道を最も濃く、道路はやや薄く、水域は陰影で差をつける。
  mono: {
    bg: "#ffffff",
    waterarea: "#d6d6d6",
    waterline: "#a0a0a0",
    river: "#8a8a8a",
    railway: "#2a2a2a",
    road: "#6a6a6a",
    roadEdge: "#b0b0b0",
    roadComponent: "#9c9c9c",
    buildingFill: "#ebebeb",
    buildingOutline: "#b8b8b8",
    structureFill: "#dddddd",
    boundary: "#8a8a8a",
    // 強調は最も濃い黒で「ここが主役」を明示。建物の地色（#ebebeb）が明るいので、
    // 塗りを濃い目に（0.55）して「塗りが濃くなった」感を出す。
    highlightFill: "#000000",
    highlightStroke: "#000000",
    highlightFillOpacity: 0.55,
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
        "source-layer": "WA",
        paint: {
          "fill-color": c.waterarea,
          "fill-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "waterarea-outline-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "WA",
        paint: {
          "line-color": c.waterline,
          "line-width": BASE_WATERAREA_OUTLINE_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "waterline-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "WL",
        paint: {
          "line-color": c.waterline,
          "line-width": BASE_WATERLINE_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "river-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "RvrCL",
        paint: {
          "line-color": c.river,
          "line-width": BASE_RIVER_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "railway-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "RailCL",
        paint: {
          "line-color": c.railway,
          "line-width": BASE_RAILWAY_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "rail-track-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "RailTrCL",
        paint: {
          "line-color": c.railway,
          "line-width": BASE_RAIL_TRACK_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "road-edge-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "RdEdg",
        minzoom: 15,
        paint: {
          "line-color": c.roadEdge,
          "line-width": BASE_ROAD_EDGE_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "road-component-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "RdCompt",
        minzoom: 15,
        paint: {
          "line-color": c.roadComponent,
          "line-width": BASE_ROAD_COMPONENT_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "road-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "RdCL",
        paint: {
          "line-color": c.road,
          "line-width": BASE_ROAD_WIDTH as unknown as number,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "building-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "BldA",
        minzoom: 13,
        paint: {
          "fill-color": c.buildingFill,
          "fill-outline-color": "rgba(0,0,0,0)",
          "fill-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "building-outline-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "BldA",
        minzoom: 13,
        paint: {
          "line-color": c.buildingOutline,
          "line-width": BASE_BUILDING_OUTLINE_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "structure-fill",
        type: "fill",
        source: SOURCE_ID,
        "source-layer": "StrctArea",
        minzoom: 13,
        paint: {
          "fill-color": c.structureFill,
          "fill-outline-color": "rgba(0,0,0,0)",
          "fill-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "structure-outline-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "StrctArea",
        minzoom: 13,
        paint: {
          "line-color": c.buildingOutline,
          "line-width": BASE_BUILDING_OUTLINE_WIDTH,
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "boundary-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "AdmBdry",
        paint: {
          "line-color": c.boundary,
          "line-width": BASE_BOUNDARY_WIDTH,
          "line-dasharray": [3, 2],
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
      {
        id: "adminarea-boundary-line",
        type: "line",
        source: SOURCE_ID,
        "source-layer": "AdmArea",
        paint: {
          "line-color": c.boundary,
          "line-width": BASE_BOUNDARY_WIDTH,
          "line-dasharray": [3, 2],
          "line-opacity": HIDDEN_OPACITY_EXPR,
        },
      },
    ],
    metadata: { attribution: GSI_ATTRIBUTION },
  };
}

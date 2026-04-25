import type maplibregl from "maplibre-gl";
import { VectorTile, VectorTileLayer } from "@mapbox/vector-tile";
import Pbf from "pbf";
// vt-pbf は CJS・型定義なし。default export を関数として利用。
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- 型定義は src/types/vt-pbf.d.ts
import vtpbf from "vt-pbf";

/**
 * 国土地理院ベクトルタイルには feature.id が一切付与されていないため、
 * そのままでは `setFeatureState` / 任意の per-feature 状態管理が行えない。
 *
 * ここでは `gsi-ids://...` という独自プロトコルを MapLibre に登録し、
 * 実 URL から取得した pbf を一旦 @mapbox/vector-tile でパース → 各 layer の
 * 各 feature に「タイル座標 + タイル内連番」由来の id を注入 → vt-pbf で
 * 再エンコード、という流れで id 付き pbf を返す。
 *
 * id は sourceLayer 内でタイルをまたいでも衝突しないが、同じ論理 feature に
 * 同じ値になるわけではない点に注意
 * （GSI のベクトルタイルは元から跨ぎ feature にグローバル id を持たない）。
 * タイル跨ぎの同一性は geometry 比較で扱う（`editState` 側の責務）。
 */

const PROTOCOL_NAME = "gsi-ids";
const PROTOCOL_PREFIX = `${PROTOCOL_NAME}://`;
const TILE_COORD_BITS = 16;
const FEATURE_INDEX_BITS = 16;
const TILE_COORD_BASE = 2 ** TILE_COORD_BITS;
const FEATURE_INDEX_BASE = 2 ** FEATURE_INDEX_BITS;
const MAX_PACKED_SOURCE_ZOOM = 16;
const MAX_TILE_COORD = TILE_COORD_BASE - 1;
const MAX_FEATURE_INDEX = FEATURE_INDEX_BASE - 1;

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

/** `gsi-ids://host/path` → `https://host/path` に書き戻す。 */
export function toRealUrl(protocolUrl: string): string {
  if (!protocolUrl.startsWith(PROTOCOL_PREFIX)) return protocolUrl;
  return `https://${protocolUrl.slice(PROTOCOL_PREFIX.length)}`;
}

/** 逆変換（source 定義を作る側で使う）。 */
export function toProtocolUrl(realUrl: string): string {
  if (realUrl.startsWith("https://")) {
    return PROTOCOL_PREFIX + realUrl.slice("https://".length);
  }
  if (realUrl.startsWith("http://")) {
    return PROTOCOL_PREFIX + realUrl.slice("http://".length);
  }
  return realUrl;
}

export function tileCoordFromUrl(url: string): TileCoord | null {
  const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf(?:[?#].*)?$/.exec(url);
  if (!m) return null;
  const z = Number(m[1]);
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { z, x, y };
}

export function tileFeatureId(tile: TileCoord, featureIndex: number): number {
  if (
    !Number.isInteger(tile.z) ||
    !Number.isInteger(tile.x) ||
    !Number.isInteger(tile.y) ||
    !Number.isInteger(featureIndex)
  ) {
    throw new Error("tile feature id requires integer z/x/y/featureIndex");
  }
  if (tile.z < 0 || tile.z > MAX_PACKED_SOURCE_ZOOM) {
    throw new Error(`tile z out of packed id range: ${tile.z}`);
  }
  if (tile.x < 0 || tile.x > MAX_TILE_COORD || tile.y < 0 || tile.y > MAX_TILE_COORD) {
    throw new Error(`tile coord out of packed id range: ${tile.z}/${tile.x}/${tile.y}`);
  }
  if (featureIndex < 0 || featureIndex > MAX_FEATURE_INDEX - 1) {
    throw new Error(`feature index out of packed id range: ${featureIndex}`);
  }

  const featureOrdinal = featureIndex + 1; // 0 を避ける。
  const id =
    tile.z * TILE_COORD_BASE * TILE_COORD_BASE * FEATURE_INDEX_BASE +
    tile.x * TILE_COORD_BASE * FEATURE_INDEX_BASE +
    tile.y * FEATURE_INDEX_BASE +
    featureOrdinal;
  if (!Number.isSafeInteger(id)) {
    throw new Error(`packed tile feature id is not a safe integer: ${id}`);
  }
  return id;
}

/**
 * @mapbox/vector-tile の VectorTileLayer を vt-pbf の writeLayer 用にラップし、
 * feature() が返す VectorTileFeature に id を注入する。
 *
 * vt-pbf は duck typing で `layer.length / .name / .version / .extent / .feature(i)`
 * を利用するので、クラスを継承せずとも同じ形を持っていれば OK。
 */
class IdInjectingLayer {
  length: number;
  name: string;
  version: number;
  extent: number;

  constructor(
    private original: VectorTileLayer,
    private tile: TileCoord,
  ) {
    this.length = original.length;
    this.name = original.name;
    this.version = original.version;
    this.extent = original.extent;
  }

  feature(i: number) {
    const f = this.original.feature(i);
    // VectorTileFeature.id は number | undefined。
    // MapLibre の feature-state は {source, sourceLayer, id} で管理され、tile 座標を
    // キーに含めないため、タイル内連番だけだと別タイルの feature に飛び火する。
    f.id = tileFeatureId(this.tile, i);
    return f;
  }
}

/**
 * pbf ArrayBuffer に id を注入して返す。
 * サイズ 0（空タイル応答）や pbf 解析失敗時は入力をそのまま返す。
 */
export function injectIdsIntoTilePbf(
  buf: ArrayBuffer,
  tile: TileCoord = { z: 0, x: 0, y: 0 },
): ArrayBuffer {
  if (buf.byteLength === 0) return buf;
  const vectorTile = new VectorTile(new Pbf(buf));
  const wrappedLayers: Record<string, IdInjectingLayer> = {};
  for (const name of Object.keys(vectorTile.layers)) {
    const layer = vectorTile.layers[name];
    if (layer) wrappedLayers[name] = new IdInjectingLayer(layer, tile);
  }
  const out = vtpbf({ layers: wrappedLayers }) as Uint8Array;
  // Uint8Array.buffer が大きすぎる（Pbf の内部バッファが余剰を持つ）ケースに備え、
  // 独立した ArrayBuffer にコピーして返す（SharedArrayBuffer の混入も避ける）。
  const ab = new ArrayBuffer(out.byteLength);
  new Uint8Array(ab).set(out);
  return ab;
}

/**
 * MapLibre に gsi-ids:// プロトコルを登録する。
 * Map コンストラクタ呼び出し「前」に一度だけ呼ぶ想定。
 */
export function registerGsiIdsProtocol(
  ml: Pick<typeof maplibregl, "addProtocol">,
  fetchImpl: typeof fetch = fetch,
): void {
  ml.addProtocol(PROTOCOL_NAME, async (params, abortController) => {
    const realUrl = toRealUrl(params.url);
    const tile = tileCoordFromUrl(realUrl);
    if (!tile) throw new Error(`could not parse tile z/x/y from URL: ${realUrl}`);
    const res = await fetchImpl(realUrl, { signal: abortController.signal });
    if (!res.ok) {
      // 404 はそのタイルが存在しないだけなので空応答で扱う（MapLibre 側が無視する）。
      if (res.status === 404) return { data: new ArrayBuffer(0) };
      throw new Error(`tile fetch failed: ${res.status} ${realUrl}`);
    }
    const buf = await res.arrayBuffer();
    const out = injectIdsIntoTilePbf(buf, tile);
    return { data: out };
  });
}

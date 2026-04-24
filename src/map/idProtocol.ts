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
 * 各 feature に「そのタイル内でユニークな連番 id」を注入 → vt-pbf で
 * 再エンコード、という流れで id 付き pbf を返す。
 *
 * id はタイルをまたいで同一 feature に同じ値になるわけではない点に注意
 * （GSI のベクトルタイルは元から跨ぎ feature にグローバル id を持たない）。
 * タイル跨ぎの同一性は geometry 比較で扱う（`editState` 側の責務）。
 */

const PROTOCOL_NAME = "gsi-ids";
const PROTOCOL_PREFIX = `${PROTOCOL_NAME}://`;

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

  constructor(private original: VectorTileLayer) {
    this.length = original.length;
    this.name = original.name;
    this.version = original.version;
    this.extent = original.extent;
  }

  feature(i: number) {
    const f = this.original.feature(i);
    // VectorTileFeature.id は number | undefined。
    // 0 を避けて 1-origin で割り当てる（MapLibre の feature-state は 0 も扱えるが、
    // falsy 判定の事故を避ける意味でも 1-origin が安全）。
    f.id = i + 1;
    return f;
  }
}

/**
 * pbf ArrayBuffer に id を注入して返す。
 * サイズ 0（空タイル応答）や pbf 解析失敗時は入力をそのまま返す。
 */
export function injectIdsIntoTilePbf(buf: ArrayBuffer): ArrayBuffer {
  if (buf.byteLength === 0) return buf;
  const tile = new VectorTile(new Pbf(buf));
  const wrappedLayers: Record<string, IdInjectingLayer> = {};
  for (const name of Object.keys(tile.layers)) {
    const layer = tile.layers[name];
    if (layer) wrappedLayers[name] = new IdInjectingLayer(layer);
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
    const res = await fetchImpl(realUrl, { signal: abortController.signal });
    if (!res.ok) {
      // 404 はそのタイルが存在しないだけなので空応答で扱う（MapLibre 側が無視する）。
      if (res.status === 404) return { data: new ArrayBuffer(0) };
      throw new Error(`tile fetch failed: ${res.status} ${realUrl}`);
    }
    const buf = await res.arrayBuffer();
    const out = injectIdsIntoTilePbf(buf);
    return { data: out };
  });
}

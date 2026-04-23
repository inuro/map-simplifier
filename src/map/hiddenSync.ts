import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { Geometry } from "geojson";
import type { HiddenFeature } from "../state/editState";
import { HIDEABLE_LAYER_IDS } from "./style";

/**
 * 非表示にしたい feature（`editState.hidden`）と MapLibre の feature-state を同期する。
 *
 * GSI experimental_bvmap は元から feature.id を持たず、本アプリでは `addProtocol('gsi-ids')`
 * がタイル内で連番 id を注入する。しかし同じ「論理 feature」でも **タイルを跨ぐと別の id**
 * になるため、`setFeatureState({id})` を単発で呼ぶだけでは広域にパンされた時に反映されない。
 *
 * そこで editState 側は sourceLayer + geometry で識別を保持し、以下のタイミングで
 * 「現在 rendered な feature を走査 → geometry がマッチした feature に feature-state を付ける」
 * という同期を行う：
 *   - editState.hidden が変わったとき（追加・削除・Undo/Redo・preset 切替後）
 *   - sourcedata で新しいタイルが読み込まれたとき（パン・ズーム）
 */

const SOURCE_ID = "gsi";

/** deep-equal を避けつつ geometry を文字列化してマッチキーに使う。 */
function keyOfGeom(sourceLayer: string, geometry: Geometry): string {
  return `${sourceLayer}::${JSON.stringify(geometry)}`;
}

export interface HiddenSyncDeps {
  map: MapLibreMap;
  /** getHidden は常に「現在の hidden リスト」を返す（クロージャで store 参照）。 */
  getHidden: () => ReadonlyArray<HiddenFeature>;
}

export class HiddenSync {
  // 現在 feature-state=hidden=true に設定済みの {sourceLayer, id} を覚える。
  // リセット時に正確に removeFeatureState するのに使う。
  private _applied = new Map<string, { sourceLayer: string; id: number }>();

  constructor(private deps: HiddenSyncDeps) {}

  /** 現在 rendered な全 hideable feature を走査し、hidden list とマッチさせて feature-state を付与。 */
  syncAll(): void {
    const hidden = this.deps.getHidden();
    // 目標：全 rendered feature の中で、hidden 集合のキーにマッチするものにだけ hidden=true。
    const wantedKeys = new Set(hidden.map((h) => keyOfGeom(h.sourceLayer, h.geometry)));

    // 1) 既存の applied をクリア（差分計算より単純で十分高速）
    for (const { sourceLayer, id } of this._applied.values()) {
      try {
        this.deps.map.removeFeatureState({ source: SOURCE_ID, sourceLayer, id });
      } catch {
        // タイル解放等で既に state が消えていても無視。
      }
    }
    this._applied.clear();

    if (wantedKeys.size === 0) return;

    // 2) 現在 rendered な hideable feature を取得し、マッチする各 feature に hidden=true。
    const feats = this.deps.map.queryRenderedFeatures(undefined, {
      layers: [...HIDEABLE_LAYER_IDS],
    }) as MapGeoJSONFeature[];

    for (const f of feats) {
      if (f.id === undefined || f.id === null) continue;
      const sl = f.sourceLayer;
      if (!sl) continue;
      const k = keyOfGeom(sl, f.geometry);
      if (!wantedKeys.has(k)) continue;
      const id = typeof f.id === "string" ? Number(f.id) : f.id;
      if (!Number.isFinite(id)) continue;
      const appliedKey = `${sl}::${id}`;
      if (this._applied.has(appliedKey)) continue;
      this.deps.map.setFeatureState(
        { source: SOURCE_ID, sourceLayer: sl, id },
        { hidden: true },
      );
      this._applied.set(appliedKey, { sourceLayer: sl, id });
    }
  }

  /** 追加タイルが読み込まれた時などに呼ぶ。差分更新ではなく全走査で十分。 */
  onSourceUpdate(): void {
    this.syncAll();
  }
}

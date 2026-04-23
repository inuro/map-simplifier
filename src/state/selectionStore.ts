import type { FeatureCollection, Geometry } from "geojson";

/**
 * 選択状態の管理。編集アクション（#16 削除, #19 強調, #9 ラベル）はこの選択状態に対して作用する。
 *
 * GSI ベクトルタイルには feature.id が無いため、選択の同一性は
 * `sourceLayer` と `geometry` の deep-equality で判定する。
 * geometry は queryRenderedFeatures 由来のため、同一 feature の同一タイルでの
 * クリックなら安定して一致する（MVP の割り切り）。
 */

export interface SelectedFeatureInput {
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface SelectedFeature extends SelectedFeatureInput {
  id: string;
}

type Listener = (state: ReadonlyArray<SelectedFeature>) => void;

/**
 * sourceLayer + geometry で同一性を判定するためのキー。
 * geometry の JSON 表現をそのまま使う（coordinates は配列なので順序は安定）。
 */
function keyOf(f: SelectedFeatureInput): string {
  return `${f.sourceLayer}::${JSON.stringify(f.geometry)}`;
}

export class SelectionStore {
  private _items: SelectedFeature[] = [];
  private _listeners = new Set<Listener>();
  private _counter = 0;

  get state(): ReadonlyArray<SelectedFeature> {
    return this._items;
  }

  /** 既存選択をクリアして単一選択に置き換え。 */
  selectOne(f: SelectedFeatureInput): void {
    this._items = [this._build(f)];
    this._emit();
  }

  /** 既存選択に追加（同一 feature はスキップ）。 */
  add(f: SelectedFeatureInput): void {
    const k = keyOf(f);
    if (this._items.some((i) => keyOf(i) === k)) return;
    this._items = [...this._items, this._build(f)];
    this._emit();
  }

  /** 存在すれば削除、なければ追加。 */
  toggle(f: SelectedFeatureInput): void {
    const k = keyOf(f);
    const idx = this._items.findIndex((i) => keyOf(i) === k);
    if (idx >= 0) {
      this._items = [...this._items.slice(0, idx), ...this._items.slice(idx + 1)];
    } else {
      this._items = [...this._items, this._build(f)];
    }
    this._emit();
  }

  clear(): void {
    if (this._items.length === 0) return;
    this._items = [];
    this._emit();
  }

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _build(f: SelectedFeatureInput): SelectedFeature {
    this._counter += 1;
    return {
      id: `s-${this._counter}`,
      sourceLayer: f.sourceLayer,
      geometry: f.geometry,
      properties: { ...f.properties },
    };
  }

  private _emit(): void {
    const snapshot = this._items;
    for (const l of this._listeners) l(snapshot);
  }
}

export function toSelectionFeatureCollection(
  list: ReadonlyArray<SelectedFeature>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: list.map((s) => ({
      type: "Feature",
      id: s.id,
      geometry: s.geometry,
      properties: {
        _id: s.id,
        _sourceLayer: s.sourceLayer,
      },
    })),
  };
}

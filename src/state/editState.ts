import type { FeatureCollection, Geometry } from "geojson";

/**
 * 非表示にされた feature の記録。
 *
 * GSI ベクトルタイルには feature.id が付与されていないため、`setFeatureState` による
 * per-feature hide は使えない。代わりに client-side で geometry を保持し、
 * 同色 mask layer のオーバレイで「消す」戦略を取る（#7）。
 *
 * `id` はこのセッション内で一意の合成値で、永続化や同期用ではない（#5 で扱う）。
 */
export interface HiddenFeature {
  id: string;
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface EditState {
  hidden: ReadonlyArray<HiddenFeature>;
}

export interface HideInput {
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

type Listener = (state: EditState) => void;

export class EditStateStore {
  private _hidden: HiddenFeature[] = [];
  private _listeners = new Set<Listener>();
  private _counter = 0;

  get state(): EditState {
    return { hidden: [...this._hidden] };
  }

  hide(input: HideInput): HiddenFeature {
    this._counter += 1;
    const entry: HiddenFeature = {
      id: `h-${this._counter}`,
      sourceLayer: input.sourceLayer,
      geometry: input.geometry,
      properties: { ...input.properties },
    };
    this._hidden.push(entry);
    this._emit();
    return entry;
  }

  clearAll(): void {
    if (this._hidden.length === 0) return;
    this._hidden.length = 0;
    this._emit();
  }

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _emit(): void {
    const s = this.state;
    for (const l of this._listeners) l(s);
  }
}

/**
 * 非表示リストを MapLibre の GeoJSON source 用 FeatureCollection に変換。
 *
 * `properties._sourceLayer` は mask 用 style 側で元レイヤ判定に使える予備情報。
 * `id` は FeatureCollection 側の feature.id としても入れておき、
 * setData 後に `map.querySourceFeatures` で辿れるようにする。
 */
export function toHiddenFeatureCollection(
  list: ReadonlyArray<HiddenFeature>,
): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: list.map((h) => ({
      type: "Feature",
      id: h.id,
      geometry: h.geometry,
      properties: {
        _id: h.id,
        _sourceLayer: h.sourceLayer,
      },
    })),
  };
}

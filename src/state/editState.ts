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

/** Undo 履歴用の独立スナップショット。clone 保持。 */
export interface EditStateSnapshot {
  hidden: HiddenFeature[];
  counter: number;
}

type Listener = (state: EditState) => void;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export class EditStateStore {
  private _hidden: HiddenFeature[] = [];
  private _listeners = new Set<Listener>();
  private _counter = 0;

  get state(): EditState {
    return { hidden: [...this._hidden] };
  }

  hide(input: HideInput): HiddenFeature {
    const entry = this._build(input);
    this._hidden.push(entry);
    this._emit();
    return entry;
  }

  /** 複数 feature を一括で非表示化。listener は 1 回だけ発火。 */
  hideMany(inputs: ReadonlyArray<HideInput>): HiddenFeature[] {
    if (inputs.length === 0) return [];
    const entries = inputs.map((i) => this._build(i));
    this._hidden.push(...entries);
    this._emit();
    return entries;
  }

  clearAll(): void {
    if (this._hidden.length === 0) return;
    this._hidden.length = 0;
    this._emit();
  }

  /** 現在の状態のディープコピーを返す。Undo 履歴への投入用。 */
  snapshot(): EditStateSnapshot {
    return {
      hidden: deepClone(this._hidden),
      counter: this._counter,
    };
  }

  /** snapshot で取った状態に復元。listener を 1 回発火。 */
  restore(s: EditStateSnapshot): void {
    this._hidden = deepClone(s.hidden);
    this._counter = s.counter;
    this._emit();
  }

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _build(input: HideInput): HiddenFeature {
    this._counter += 1;
    return {
      id: `h-${this._counter}`,
      sourceLayer: input.sourceLayer,
      geometry: input.geometry,
      properties: { ...input.properties },
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

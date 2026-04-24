import type { FeatureCollection, Geometry } from "geojson";

/**
 * 編集状態。hidden（非表示）と highlighted（強調）の 2 つのリストを持つ。
 *
 * GSI ベクトルタイルには feature.id が付与されていないため、feature の
 * 同一性は sourceLayer + geometry(JSON) の deep-equal で判定する。
 * id はセッション内で一意の合成値（永続化用ではない）。
 */
export interface HiddenFeature {
  id: string;
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface HighlightedFeature {
  id: string;
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface EditState {
  hidden: ReadonlyArray<HiddenFeature>;
  highlighted: ReadonlyArray<HighlightedFeature>;
}

export interface HideInput {
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export type HighlightInput = HideInput;

/** Undo 履歴用の独立スナップショット。clone 保持。 */
export interface EditStateSnapshot {
  hidden: HiddenFeature[];
  highlighted: HighlightedFeature[];
  counter: number;
  highlightCounter: number;
}

type Listener = (state: EditState) => void;

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function keyOf(f: { sourceLayer: string; geometry: Geometry }): string {
  return `${f.sourceLayer}::${JSON.stringify(f.geometry)}`;
}

export class EditStateStore {
  private _hidden: HiddenFeature[] = [];
  private _highlighted: HighlightedFeature[] = [];
  private _listeners = new Set<Listener>();
  private _counter = 0;
  private _highlightCounter = 0;

  get state(): EditState {
    return { hidden: [...this._hidden], highlighted: [...this._highlighted] };
  }

  // --- hide ---

  hide(input: HideInput): HiddenFeature {
    const entry = this._buildHidden(input);
    this._hidden.push(entry);
    this._emit();
    return entry;
  }

  hideMany(inputs: ReadonlyArray<HideInput>): HiddenFeature[] {
    if (inputs.length === 0) return [];
    const entries = inputs.map((i) => this._buildHidden(i));
    this._hidden.push(...entries);
    this._emit();
    return entries;
  }

  clearAll(): void {
    if (this._hidden.length === 0 && this._highlighted.length === 0) return;
    this._hidden.length = 0;
    this._highlighted.length = 0;
    this._emit();
  }

  // --- highlight ---

  /** 複数 feature を強調。listener は 1 回だけ発火。 */
  highlightMany(inputs: ReadonlyArray<HighlightInput>): HighlightedFeature[] {
    if (inputs.length === 0) return [];
    const entries = inputs.map((i) => this._buildHighlight(i));
    this._highlighted.push(...entries);
    this._emit();
    return entries;
  }

  /** geometry match で強調解除。1 件以上マッチした場合のみ listener 発火。 */
  unhighlightMatching(inputs: ReadonlyArray<HighlightInput>): void {
    if (inputs.length === 0) return;
    const keys = new Set(inputs.map(keyOf));
    const before = this._highlighted.length;
    this._highlighted = this._highlighted.filter((h) => !keys.has(keyOf(h)));
    if (this._highlighted.length !== before) this._emit();
  }

  isHighlighted(input: HighlightInput): boolean {
    const k = keyOf(input);
    return this._highlighted.some((h) => keyOf(h) === k);
  }

  /** sourceLayer + geometry (deep-equal) で隠しリストにマッチするか。 */
  isHidden(input: { sourceLayer: string; geometry: Geometry }): boolean {
    const k = keyOf(input);
    return this._hidden.some((h) => keyOf(h) === k);
  }

  // --- snapshot ---

  snapshot(): EditStateSnapshot {
    return {
      hidden: deepClone(this._hidden),
      highlighted: deepClone(this._highlighted),
      counter: this._counter,
      highlightCounter: this._highlightCounter,
    };
  }

  restore(s: EditStateSnapshot): void {
    this._hidden = deepClone(s.hidden);
    this._highlighted = deepClone(s.highlighted);
    this._counter = s.counter;
    this._highlightCounter = s.highlightCounter;
    this._emit();
  }

  // --- subscribe ---

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _buildHidden(input: HideInput): HiddenFeature {
    this._counter += 1;
    return {
      id: `h-${this._counter}`,
      sourceLayer: input.sourceLayer,
      geometry: input.geometry,
      properties: { ...input.properties },
    };
  }

  private _buildHighlight(input: HighlightInput): HighlightedFeature {
    this._highlightCounter += 1;
    return {
      id: `hl-${this._highlightCounter}`,
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

export function toHighlightFeatureCollection(
  list: ReadonlyArray<HighlightedFeature>,
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

export const LAYER_VISIBILITY_CATEGORIES = [
  {
    id: "water",
    label: "水域",
    layerIds: ["waterarea-fill", "waterarea-outline-line", "waterline-line", "river-line"],
    sourceLayers: ["WA", "WL", "RvrCL"],
  },
  {
    id: "road",
    label: "道路中心線",
    layerIds: ["road-line"],
    sourceLayers: ["RdCL"],
  },
  {
    id: "roadEdge",
    label: "道路枠線",
    layerIds: ["road-edge-line", "road-component-line"],
    sourceLayers: ["RdEdg", "RdCompt"],
  },
  {
    id: "railway",
    label: "鉄道",
    layerIds: ["railway-line", "rail-track-line"],
    sourceLayers: ["RailCL", "RailTrCL"],
  },
  {
    id: "building",
    label: "建物",
    layerIds: [
      "building-fill",
      "building-outline-line",
      "structure-fill",
      "structure-outline-line",
    ],
    sourceLayers: ["BldA", "StrctArea"],
  },
  {
    id: "boundary",
    label: "行政界",
    layerIds: ["boundary-line", "adminarea-boundary-line"],
    sourceLayers: ["AdmBdry", "AdmArea"],
  },
] as const;

export type LayerVisibilityCategory = (typeof LAYER_VISIBILITY_CATEGORIES)[number]["id"];

export type LayerVisibilityState = Record<LayerVisibilityCategory, boolean>;

export const DEFAULT_LAYER_VISIBILITY: LayerVisibilityState = Object.fromEntries(
  LAYER_VISIBILITY_CATEGORIES.map((c) => [c.id, true]),
) as LayerVisibilityState;

type Listener = (state: LayerVisibilityState) => void;

export class LayerVisibilityStore {
  private _state: LayerVisibilityState = { ...DEFAULT_LAYER_VISIBILITY };
  private _listeners = new Set<Listener>();

  get state(): Readonly<LayerVisibilityState> {
    return { ...this._state };
  }

  set(category: LayerVisibilityCategory, visible: boolean): void {
    if (this._state[category] === visible) return;
    this._state = { ...this._state, [category]: visible };
    this._emit();
  }

  toggle(category: LayerVisibilityCategory): void {
    this.set(category, !this._state[category]);
  }

  reset(): void {
    if (LAYER_VISIBILITY_CATEGORIES.every((c) => this._state[c.id])) return;
    this._state = { ...DEFAULT_LAYER_VISIBILITY };
    this._emit();
  }

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _emit(): void {
    const snapshot = this.state;
    for (const l of this._listeners) l(snapshot);
  }
}

export function layerIdsForCategory(
  category: LayerVisibilityCategory,
): readonly string[] {
  return LAYER_VISIBILITY_CATEGORIES.find((c) => c.id === category)?.layerIds ?? [];
}

export function isSourceLayerVisible(
  sourceLayer: string,
  state: Readonly<LayerVisibilityState>,
): boolean {
  const category = LAYER_VISIBILITY_CATEGORIES.find((c) =>
    (c.sourceLayers as readonly string[]).includes(sourceLayer),
  );
  return category ? state[category.id] : true;
}

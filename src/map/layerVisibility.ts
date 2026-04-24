import type { Map as MapLibreMap } from "maplibre-gl";
import {
  LAYER_VISIBILITY_CATEGORIES,
  type LayerVisibilityState,
} from "../state/layerVisibilityStore";

export function applyLayerVisibility(
  map: MapLibreMap,
  state: Readonly<LayerVisibilityState>,
): void {
  for (const category of LAYER_VISIBILITY_CATEGORIES) {
    const visibility = state[category.id] ? "visible" : "none";
    for (const layerId of category.layerIds) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility);
      }
    }
  }
}

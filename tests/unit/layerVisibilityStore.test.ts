import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYER_VISIBILITY,
  LAYER_VISIBILITY_CATEGORIES,
  LayerVisibilityStore,
  isSourceLayerVisible,
  layerIdsForCategory,
} from "../../src/state/layerVisibilityStore";

describe("LayerVisibilityStore", () => {
  it("starts with all categories visible", () => {
    const s = new LayerVisibilityStore();
    expect(s.state).toEqual(DEFAULT_LAYER_VISIBILITY);
    expect(Object.values(s.state).every(Boolean)).toBe(true);
  });

  it("sets a single category visibility and notifies listeners", () => {
    const s = new LayerVisibilityStore();
    const l = vi.fn();
    s.subscribe(l);
    s.set("building", false);
    expect(s.state.building).toBe(false);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("does not notify when setting to the current value", () => {
    const s = new LayerVisibilityStore();
    const l = vi.fn();
    s.subscribe(l);
    s.set("building", true);
    expect(l).not.toHaveBeenCalled();
  });

  it("resets all categories to visible", () => {
    const s = new LayerVisibilityStore();
    s.set("building", false);
    s.set("road", false);
    s.reset();
    expect(s.state).toEqual(DEFAULT_LAYER_VISIBILITY);
  });
});

describe("layer visibility category mapping", () => {
  it("maps building category to building-fill layer", () => {
    expect(layerIdsForCategory("building")).toEqual([
      "building-fill",
      "building-outline-line",
      "structure-fill",
      "structure-outline-line",
    ]);
  });

  it("maps road edge category separately from road centerlines", () => {
    expect(layerIdsForCategory("road")).toEqual(["road-line"]);
    expect(layerIdsForCategory("roadEdge")).toEqual([
      "road-edge-line",
      "road-component-line",
    ]);
    const state = { ...DEFAULT_LAYER_VISIBILITY, roadEdge: false };
    expect(isSourceLayerVisible("RdCL", state)).toBe(true);
    expect(isSourceLayerVisible("RdEdg", state)).toBe(false);
    expect(isSourceLayerVisible("RdCompt", state)).toBe(false);
  });

  it("groups water source layers under one category", () => {
    expect(layerIdsForCategory("water")).toEqual([
      "waterarea-fill",
      "waterarea-outline-line",
      "waterline-line",
      "river-line",
    ]);
    const state = { ...DEFAULT_LAYER_VISIBILITY, water: false };
    expect(isSourceLayerVisible("WA", state)).toBe(false);
    expect(isSourceLayerVisible("WL", state)).toBe(false);
    expect(isSourceLayerVisible("RvrCL", state)).toBe(false);
    expect(isSourceLayerVisible("RdCL", state)).toBe(true);
  });

  it("keeps unknown source layers visible by default", () => {
    expect(isSourceLayerVisible("label", DEFAULT_LAYER_VISIBILITY)).toBe(true);
  });

  it("keeps all category ids unique", () => {
    const ids = LAYER_VISIBILITY_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

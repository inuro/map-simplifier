import { describe, expect, it, vi } from "vitest";
import type { Feature, LineString, Polygon } from "geojson";
import { EditStateStore, toHiddenFeatureCollection } from "../../src/state/editState";

function lineFeature(coords: [number, number][]): Feature<LineString> {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: { ftCode: 2701 },
  };
}

function polygonFeature(coords: [number, number][]): Feature<Polygon> {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: { ftCode: 3101 },
  };
}

describe("EditStateStore", () => {
  it("starts empty", () => {
    const s = new EditStateStore();
    expect(s.state.hidden).toEqual([]);
  });

  it("hides a feature and returns the created entry with a stable id prefix", () => {
    const s = new EditStateStore();
    const f = lineFeature([
      [139.767, 35.681],
      [139.768, 35.682],
    ]);
    const entry = s.hide({
      sourceLayer: "road",
      geometry: f.geometry,
      properties: f.properties ?? {},
    });
    expect(entry.id).toMatch(/^h-\d+$/);
    expect(entry.sourceLayer).toBe("road");
    expect(entry.geometry).toEqual(f.geometry);
    expect(s.state.hidden).toHaveLength(1);
  });

  it("assigns a unique id to each hidden entry", () => {
    const s = new EditStateStore();
    const a = s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    const b = s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} });
    expect(a.id).not.toBe(b.id);
  });

  it("clearAll empties the list and fires a listener", () => {
    const s = new EditStateStore();
    s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    const listener = vi.fn();
    s.subscribe(listener);
    s.clearAll();
    expect(s.state.hidden).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clearAll is a no-op when already empty (no listener call)", () => {
    const s = new EditStateStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.clearAll();
    expect(listener).not.toHaveBeenCalled();
  });

  it("subscribe returns an unsubscribe function", () => {
    const s = new EditStateStore();
    const listener = vi.fn();
    const off = s.subscribe(listener);
    s.hide({ sourceLayer: "x", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    s.hide({ sourceLayer: "x", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("toHiddenFeatureCollection", () => {
  it("returns an empty FeatureCollection for an empty list", () => {
    expect(toHiddenFeatureCollection([])).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("serializes hidden entries, preserving sourceLayer in properties._sourceLayer", () => {
    const store = new EditStateStore();
    const a = store.hide({
      sourceLayer: "road",
      geometry: lineFeature([
        [0, 0],
        [1, 1],
      ]).geometry,
      properties: { ftCode: 2701 },
    });
    const b = store.hide({
      sourceLayer: "building",
      geometry: polygonFeature([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]).geometry,
      properties: {},
    });
    const fc = toHiddenFeatureCollection(store.state.hidden);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.id).toBe(a.id);
    expect(fc.features[0]!.properties?._sourceLayer).toBe("road");
    expect(fc.features[1]!.id).toBe(b.id);
    expect(fc.features[1]!.properties?._sourceLayer).toBe("building");
  });
});

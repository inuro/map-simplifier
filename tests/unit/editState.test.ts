import { describe, expect, it, vi } from "vitest";
import type { Feature, LineString, Polygon } from "geojson";
import {
  EditStateStore,
  toHiddenFeatureCollection,
  toHighlightFeatureCollection,
} from "../../src/state/editState";

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

  it("hideMany appends multiple features in a single listener call", () => {
    const s = new EditStateStore();
    const listener = vi.fn();
    s.subscribe(listener);
    const entries = s.hideMany([
      { sourceLayer: "road", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} },
      { sourceLayer: "road", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} },
      { sourceLayer: "building", geometry: { type: "Point", coordinates: [2, 2] }, properties: {} },
    ]);
    expect(entries).toHaveLength(3);
    expect(s.state.hidden).toHaveLength(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("hideMany with empty array does not fire listener", () => {
    const s = new EditStateStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.hideMany([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it("snapshot + restore roundtrips the hidden list", () => {
    const s = new EditStateStore();
    s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [0, 0] }, properties: { a: 1 } });
    s.hide({ sourceLayer: "building", geometry: { type: "Point", coordinates: [5, 5] }, properties: {} });
    const snap = s.snapshot();

    s.clearAll();
    expect(s.state.hidden).toEqual([]);

    const listener = vi.fn();
    s.subscribe(listener);
    s.restore(snap);
    expect(s.state.hidden).toHaveLength(2);
    expect(s.state.hidden[0]!.sourceLayer).toBe("road");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("snapshot is independent of subsequent mutations (deep-copied)", () => {
    const s = new EditStateStore();
    s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    const snap = s.snapshot();
    s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [1, 1] }, properties: {} });
    expect(snap.hidden).toHaveLength(1);
    expect(s.state.hidden).toHaveLength(2);
  });
});

describe("EditStateStore highlight", () => {
  const featA = {
    sourceLayer: "building",
    geometry: { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: {},
  };
  const featB = {
    sourceLayer: "road",
    geometry: { type: "LineString" as const, coordinates: [[10, 10], [11, 11]] },
    properties: {},
  };

  it("starts with empty highlighted list", () => {
    const s = new EditStateStore();
    expect(s.state.highlighted).toEqual([]);
  });

  it("highlightMany appends entries with h-prefixed ids", () => {
    const s = new EditStateStore();
    const entries = s.highlightMany([featA, featB]);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.id).toMatch(/^hl-\d+$/);
    expect(s.state.highlighted).toHaveLength(2);
  });

  it("isHighlighted matches by sourceLayer + geometry (deep-equal)", () => {
    const s = new EditStateStore();
    s.highlightMany([featA]);
    expect(s.isHighlighted(featA)).toBe(true);
    // Same geometry, different sourceLayer → not highlighted
    expect(s.isHighlighted({ ...featA, sourceLayer: "road" })).toBe(false);
    expect(s.isHighlighted(featB)).toBe(false);
  });

  it("unhighlightMatching removes by geometry match", () => {
    const s = new EditStateStore();
    s.highlightMany([featA, featB]);
    s.unhighlightMatching([featA]);
    expect(s.state.highlighted).toHaveLength(1);
    expect(s.isHighlighted(featA)).toBe(false);
    expect(s.isHighlighted(featB)).toBe(true);
  });

  it("snapshot + restore preserves highlighted list too", () => {
    const s = new EditStateStore();
    s.hide({ sourceLayer: "road", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} });
    s.highlightMany([featA, featB]);
    const snap = s.snapshot();
    s.unhighlightMatching([featA, featB]);
    s.clearAll();
    expect(s.state.hidden).toEqual([]);
    expect(s.state.highlighted).toEqual([]);
    s.restore(snap);
    expect(s.state.hidden).toHaveLength(1);
    expect(s.state.highlighted).toHaveLength(2);
  });

  it("highlightMany with empty array does not fire listener", () => {
    const s = new EditStateStore();
    const l = vi.fn();
    s.subscribe(l);
    s.highlightMany([]);
    expect(l).not.toHaveBeenCalled();
  });

  it("unhighlightMatching no-match does not fire listener", () => {
    const s = new EditStateStore();
    const l = vi.fn();
    s.subscribe(l);
    s.unhighlightMatching([featA]);
    expect(l).not.toHaveBeenCalled();
  });
});

describe("toHighlightFeatureCollection", () => {
  it("serializes highlighted entries like hidden ones", () => {
    const s = new EditStateStore();
    const [a] = s.highlightMany([
      {
        sourceLayer: "building",
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
        properties: {},
      },
    ]);
    const fc = toHighlightFeatureCollection(s.state.highlighted);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]!.id).toBe(a!.id);
    expect(fc.features[0]!.properties?._sourceLayer).toBe("building");
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

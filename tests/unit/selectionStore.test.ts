import { describe, expect, it, vi } from "vitest";
import type { Geometry } from "geojson";
import { SelectionStore, toSelectionFeatureCollection } from "../../src/state/selectionStore";

function poly(coords: [number, number][]): Geometry {
  return { type: "Polygon", coordinates: [coords] };
}

function line(coords: [number, number][]): Geometry {
  return { type: "LineString", coordinates: coords };
}

const A = { sourceLayer: "building", geometry: poly([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]), properties: { ftCode: 3101 } };
const B = { sourceLayer: "building", geometry: poly([[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]), properties: { ftCode: 3101 } };
const C = { sourceLayer: "road", geometry: line([[5, 5], [5, 6]]), properties: { ftCode: 2701 } };

describe("SelectionStore", () => {
  it("starts empty", () => {
    const s = new SelectionStore();
    expect(s.state).toEqual([]);
  });

  it("selectOne replaces the current selection (single-select)", () => {
    const s = new SelectionStore();
    s.selectOne(A);
    expect(s.state).toHaveLength(1);
    s.selectOne(B);
    expect(s.state).toHaveLength(1);
    expect(s.state[0]!.sourceLayer).toBe("building");
    expect((s.state[0]!.geometry as { coordinates: unknown }).coordinates).toEqual(
      (B.geometry as { coordinates: unknown }).coordinates,
    );
  });

  it("add appends to the selection (multi-select)", () => {
    const s = new SelectionStore();
    s.add(A);
    s.add(B);
    s.add(C);
    expect(s.state).toHaveLength(3);
  });

  it("add dedupes the same feature (same sourceLayer + geometry)", () => {
    const s = new SelectionStore();
    s.add(A);
    s.add(A);
    expect(s.state).toHaveLength(1);
  });

  it("toggle adds if absent and removes if present", () => {
    const s = new SelectionStore();
    s.toggle(A);
    expect(s.state).toHaveLength(1);
    s.toggle(A);
    expect(s.state).toEqual([]);
    s.toggle(A);
    s.toggle(B);
    expect(s.state).toHaveLength(2);
    s.toggle(A);
    expect(s.state).toHaveLength(1);
    expect(s.state[0]!.geometry).toEqual(B.geometry);
  });

  it("clear empties the selection and fires listener once", () => {
    const s = new SelectionStore();
    s.add(A);
    s.add(B);
    const listener = vi.fn();
    s.subscribe(listener);
    s.clear();
    expect(s.state).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clear is a no-op when already empty (no listener call)", () => {
    const s = new SelectionStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it("subscribe/unsubscribe", () => {
    const s = new SelectionStore();
    const l = vi.fn();
    const off = s.subscribe(l);
    s.selectOne(A);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    s.selectOne(B);
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("selectOne fires listener even when replacing (content changed)", () => {
    const s = new SelectionStore();
    s.selectOne(A);
    const l = vi.fn();
    s.subscribe(l);
    s.selectOne(B);
    expect(l).toHaveBeenCalledTimes(1);
  });
});

describe("toSelectionFeatureCollection", () => {
  it("returns empty FeatureCollection for empty selection", () => {
    expect(toSelectionFeatureCollection([])).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("serializes each entry with stable id and sourceLayer property", () => {
    const s = new SelectionStore();
    s.add(A);
    s.add(C);
    const fc = toSelectionFeatureCollection(s.state);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]!.properties?._sourceLayer).toBe("building");
    expect(fc.features[1]!.properties?._sourceLayer).toBe("road");
  });
});

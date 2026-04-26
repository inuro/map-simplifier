import { describe, expect, it } from "vitest";
import type { EditStateSnapshot } from "../../src/state/editState";
import {
  buildProjectSnapshot,
  editSnapshotFromProjectSnapshot,
  formatBytes,
  normalizeProjectSnapshot,
  parseProjectSnapshotJson,
  safeFilenamePart,
  serializeProjectSnapshot,
} from "../../src/state/projectSnapshot";
import { DEFAULT_LAYER_VISIBILITY } from "../../src/state/layerVisibilityStore";
import { DEFAULT_LINE_WIDTH_FACTORS } from "../../src/state/lineWidthStore";

const editState: EditStateSnapshot = {
  hidden: [
    {
      id: "h-9",
      sourceLayer: "BldA",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [139, 35],
            [139.1, 35],
            [139.1, 35.1],
            [139, 35],
          ],
        ],
      },
      properties: { vt_code: 3111 },
    },
  ],
  highlighted: [
    {
      id: "hl-7",
      sourceLayer: "RdCL",
      geometry: { type: "LineString", coordinates: [[139, 35], [139.1, 35.1]] },
      properties: { vt_code: 2701 },
    },
  ],
  counter: 9,
  highlightCounter: 7,
};

describe("ProjectSnapshot", () => {
  it("serializes current app state without session-local edit ids", () => {
    const snapshot = buildProjectSnapshot({
      appVersion: "0.6.0",
      label: "札幌",
      view: { center: { lat: 43.066, lng: 141.353 }, zoom: 16.35 },
      preset: "mono",
      layerVisibility: { ...DEFAULT_LAYER_VISIBILITY, building: false },
      lineWidth: { ...DEFAULT_LINE_WIDTH_FACTORS, road: 1.25 },
      editState,
      savedAt: new Date("2026-04-25T00:00:00.000Z"),
    });

    expect(snapshot.edit.hidden).toHaveLength(1);
    const hidden = snapshot.edit.hidden[0];
    if (!hidden) throw new Error("hidden feature missing");
    expect(hidden).toMatchObject({
      sourceLayer: "BldA",
      properties: { vt_code: 3111 },
    });
    expect("id" in hidden).toBe(false);

    const parsed = parseProjectSnapshotJson(serializeProjectSnapshot(snapshot));
    expect(parsed).toEqual(snapshot);
  });

  it("rebuilds editState ids for restore", () => {
    const snapshot = buildProjectSnapshot({
      appVersion: "0.6.0",
      label: "restore",
      view: { center: { lat: 35, lng: 139 }, zoom: 15 },
      preset: "standard",
      layerVisibility: DEFAULT_LAYER_VISIBILITY,
      lineWidth: DEFAULT_LINE_WIDTH_FACTORS,
      editState,
    });

    expect(editSnapshotFromProjectSnapshot(snapshot)).toMatchObject({
      hidden: [{ id: "h-1", sourceLayer: "BldA" }],
      highlighted: [{ id: "hl-1", sourceLayer: "RdCL" }],
      counter: 1,
      highlightCounter: 1,
    });
  });

  it("normalizes missing optional settings to defaults", () => {
    const normalized = normalizeProjectSnapshot({
      version: 1,
      label: "minimal",
      savedAt: "2026-04-25T00:00:00.000Z",
      view: { center: { lat: 35, lng: 139 }, zoom: 14 },
      preset: "unknown",
      edit: { hidden: [], highlighted: [] },
    });

    expect(normalized.preset).toBe("standard");
    expect(normalized.layerVisibility).toEqual(DEFAULT_LAYER_VISIBILITY);
    expect(normalized.lineWidth).toEqual(DEFAULT_LINE_WIDTH_FACTORS);
  });

  it("formats helper strings for UI", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(safeFilenamePart(" 札幌/駅:テスト ")).toBe("札幌-駅-テスト");
  });
});

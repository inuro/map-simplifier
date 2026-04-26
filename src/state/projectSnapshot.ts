import type { Geometry } from "geojson";
import { PRESETS, type Preset } from "../map/style";
import type { EditStateSnapshot } from "./editState";
import {
  DEFAULT_LAYER_VISIBILITY,
  LAYER_VISIBILITY_CATEGORIES,
  type LayerVisibilityState,
} from "./layerVisibilityStore";
import {
  DEFAULT_LINE_WIDTH_FACTORS,
  LINE_WIDTH_CATEGORIES,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  type LineWidthFactors,
} from "./lineWidthStore";
import type { ViewState } from "./viewState";

export const PROJECT_SNAPSHOT_VERSION = 1;

export interface SnapshotFeature {
  sourceLayer: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface ProjectSnapshot {
  version: typeof PROJECT_SNAPSHOT_VERSION;
  appVersion: string;
  label: string;
  savedAt: string;
  view: ViewState;
  preset: Preset;
  layerVisibility: LayerVisibilityState;
  lineWidth: LineWidthFactors;
  edit: {
    hidden: SnapshotFeature[];
    highlighted: SnapshotFeature[];
  };
}

export interface BuildProjectSnapshotInput {
  appVersion: string;
  label: string;
  view: ViewState;
  preset: Preset;
  layerVisibility: Readonly<LayerVisibilityState>;
  lineWidth: Readonly<LineWidthFactors>;
  editState: EditStateSnapshot;
  savedAt?: Date;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function snapshotFeature(
  f: Pick<SnapshotFeature, "sourceLayer" | "geometry" | "properties">,
): SnapshotFeature {
  return {
    sourceLayer: f.sourceLayer,
    geometry: cloneJson(f.geometry),
    properties: cloneJson(f.properties ?? {}),
  };
}

export function buildProjectSnapshot(input: BuildProjectSnapshotInput): ProjectSnapshot {
  return {
    version: PROJECT_SNAPSHOT_VERSION,
    appVersion: input.appVersion,
    label: input.label.trim(),
    savedAt: (input.savedAt ?? new Date()).toISOString(),
    view: cloneJson(input.view),
    preset: input.preset,
    layerVisibility: cloneJson(input.layerVisibility) as LayerVisibilityState,
    lineWidth: cloneJson(input.lineWidth) as LineWidthFactors,
    edit: {
      hidden: input.editState.hidden.map(snapshotFeature),
      highlighted: input.editState.highlighted.map(snapshotFeature),
    },
  };
}

export function editSnapshotFromProjectSnapshot(
  snapshot: ProjectSnapshot,
): EditStateSnapshot {
  return {
    hidden: snapshot.edit.hidden.map((f, i) => ({
      id: `h-${i + 1}`,
      ...snapshotFeature(f),
    })),
    highlighted: snapshot.edit.highlighted.map((f, i) => ({
      id: `hl-${i + 1}`,
      ...snapshotFeature(f),
    })),
    counter: snapshot.edit.hidden.length,
    highlightCounter: snapshot.edit.highlighted.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeView(value: unknown): ViewState {
  if (!isRecord(value) || !isRecord(value["center"])) {
    throw new Error("view が不正です");
  }
  const center = value["center"];
  const lat = asNumber(center["lat"], NaN);
  const lng = asNumber(center["lng"], NaN);
  const zoom = asNumber(value["zoom"], NaN);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(zoom) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180 ||
    zoom < 0 ||
    zoom > 22
  ) {
    throw new Error("view の緯度経度またはズームが範囲外です");
  }
  return { center: { lat, lng }, zoom };
}

function normalizePreset(value: unknown): Preset {
  return (PRESETS as readonly unknown[]).includes(value) ? (value as Preset) : "standard";
}

function normalizeLayerVisibility(value: unknown): LayerVisibilityState {
  const out: LayerVisibilityState = { ...DEFAULT_LAYER_VISIBILITY };
  if (!isRecord(value)) return out;
  for (const category of LAYER_VISIBILITY_CATEGORIES) {
    const v = value[category.id];
    if (typeof v === "boolean") out[category.id] = v;
  }
  return out;
}

function normalizeLineWidth(value: unknown): LineWidthFactors {
  const out: LineWidthFactors = { ...DEFAULT_LINE_WIDTH_FACTORS };
  if (!isRecord(value)) return out;
  for (const category of LINE_WIDTH_CATEGORIES) {
    const v = value[category];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[category] = Math.min(LINE_WIDTH_MAX, Math.max(LINE_WIDTH_MIN, v));
    }
  }
  return out;
}

function normalizeGeometry(value: unknown): Geometry {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    throw new Error("feature geometry が不正です");
  }
  return cloneJson(value) as unknown as Geometry;
}

function normalizeProperties(value: unknown): Record<string, unknown> {
  return isRecord(value) ? cloneJson(value) : {};
}

function normalizeFeatures(value: unknown, key: string): SnapshotFeature[] {
  if (!Array.isArray(value)) {
    throw new Error(`${key} が配列ではありません`);
  }
  return value.map((item) => {
    if (!isRecord(item) || typeof item["sourceLayer"] !== "string") {
      throw new Error(`${key} の feature が不正です`);
    }
    return {
      sourceLayer: item["sourceLayer"],
      geometry: normalizeGeometry(item["geometry"]),
      properties: normalizeProperties(item["properties"]),
    };
  });
}

export function normalizeProjectSnapshot(value: unknown): ProjectSnapshot {
  if (!isRecord(value)) throw new Error("JSON root が object ではありません");
  if (value["version"] !== PROJECT_SNAPSHOT_VERSION) {
    throw new Error(`未対応の snapshot version です: ${String(value["version"])}`);
  }

  const edit = isRecord(value["edit"]) ? value["edit"] : {};
  const label = typeof value["label"] === "string" ? value["label"].trim() : "";
  const appVersion = typeof value["appVersion"] === "string" ? value["appVersion"] : "";
  const savedAt =
    typeof value["savedAt"] === "string" && !Number.isNaN(Date.parse(value["savedAt"]))
      ? value["savedAt"]
      : new Date().toISOString();

  return {
    version: PROJECT_SNAPSHOT_VERSION,
    appVersion,
    label: label || "imported",
    savedAt,
    view: normalizeView(value["view"]),
    preset: normalizePreset(value["preset"]),
    layerVisibility: normalizeLayerVisibility(value["layerVisibility"]),
    lineWidth: normalizeLineWidth(value["lineWidth"]),
    edit: {
      hidden: normalizeFeatures(edit["hidden"], "edit.hidden"),
      highlighted: normalizeFeatures(edit["highlighted"], "edit.highlighted"),
    },
  };
}

export function parseProjectSnapshotJson(text: string): ProjectSnapshot {
  return normalizeProjectSnapshot(JSON.parse(text));
}

export function serializeProjectSnapshot(snapshot: ProjectSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function projectSnapshotByteSize(snapshot: ProjectSnapshot): number {
  return new TextEncoder().encode(serializeProjectSnapshot(snapshot)).byteLength;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function safeFilenamePart(raw: string): string {
  const s = raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "_")
    .replace(/^-+|-+$/g, "");
  return s || "map-simplifier";
}

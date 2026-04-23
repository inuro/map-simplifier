import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildBaseStyle, type Preset } from "./map/style";
import { GSI_ATTRIBUTION } from "./map/gsiSource";
import {
  ensureHiddenOverlay,
  setHiddenOverlayData,
  HIDEABLE_LAYER_IDS,
} from "./map/overlay";
import {
  ensureSelectionOverlay,
  setSelectionOverlayData,
} from "./map/selectionOverlay";
import {
  DEFAULT_VIEW,
  decodeHashToView,
  encodeViewToHash,
  type ViewState,
} from "./state/viewState";
import {
  EditStateStore,
  toHiddenFeatureCollection,
  type EditStateSnapshot,
} from "./state/editState";
import { SelectionStore, toSelectionFeatureCollection } from "./state/selectionStore";
import { History } from "./state/history";
import { buildExportFilename, composePngWithCredit, downloadCanvasAsPng } from "./export/png";

function requireEl<T extends Element>(id: string, ctor: new (...a: never[]) => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`missing #${id}`);
  return el;
}

const mapRoot = requireEl("map", HTMLElement);
const exportButton = requireEl("export-png", HTMLButtonElement);
const presetStandardBtn = requireEl("preset-standard", HTMLButtonElement);
const presetMonoBtn = requireEl("preset-mono", HTMLButtonElement);
const undoBtn = requireEl("undo", HTMLButtonElement);
const redoBtn = requireEl("redo", HTMLButtonElement);
const deleteBtn = requireEl("delete", HTMLButtonElement);
const resetEditsBtn = requireEl("reset-edits", HTMLButtonElement);
const selectionCountEl = requireEl("selection-count", HTMLSpanElement);

const initialView: ViewState = decodeHashToView(window.location.hash) ?? DEFAULT_VIEW;
let currentPreset: Preset = "standard";
const editState = new EditStateStore();
const selectionStore = new SelectionStore();
const history = new History<EditStateSnapshot>();

const map: MapLibreMap = new maplibregl.Map({
  container: mapRoot,
  style: buildBaseStyle(currentPreset),
  center: [initialView.center.lng, initialView.center.lat],
  zoom: initialView.zoom,
  hash: false,
  attributionControl: false,
  preserveDrawingBuffer: true,
});

map.addControl(
  new maplibregl.AttributionControl({ compact: true, customAttribution: GSI_ATTRIBUTION }),
  "bottom-right",
);
map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

function syncHash(): void {
  const c = map.getCenter();
  const v: ViewState = {
    center: { lng: c.lng, lat: c.lat },
    zoom: map.getZoom(),
  };
  const h = encodeViewToHash(v);
  if (window.location.hash !== h) {
    window.history.replaceState(null, "", h);
  }
}
map.on("moveend", syncHash);
map.on("zoomend", syncHash);

function refreshOverlays(): void {
  ensureHiddenOverlay(map, currentPreset, toHiddenFeatureCollection(editState.state.hidden));
  ensureSelectionOverlay(map, toSelectionFeatureCollection(selectionStore.state));
}

map.on("load", () => {
  refreshOverlays();
  document.body.dataset["mapReady"] = "true";
});

// preset 切替は setStyle を伴い overlay を飛ばすことがある。
// styledata はその後何度か発火するが、isStyleLoaded() が真になってから
// overlay を復元する（もしくは色を追従させる）。
map.on("styledata", () => {
  if (!map.isStyleLoaded()) return;
  refreshOverlays();
});

editState.subscribe((s) => {
  setHiddenOverlayData(map, toHiddenFeatureCollection(s.hidden));
  resetEditsBtn.disabled = s.hidden.length === 0;
});
resetEditsBtn.disabled = true;

function updateSelectionUI(): void {
  const n = selectionStore.state.length;
  selectionCountEl.textContent = n > 0 ? `選択: ${n}` : "";
  setSelectionOverlayData(map, toSelectionFeatureCollection(selectionStore.state));
  deleteBtn.disabled = n === 0;
}
selectionStore.subscribe(() => updateSelectionUI());
updateSelectionUI();

history.subscribe((status) => {
  undoBtn.disabled = !status.canUndo;
  redoBtn.disabled = !status.canRedo;
});

if (import.meta.env.DEV) {
  const w = globalThis as unknown as {
    __mlMap?: MapLibreMap;
    __editState?: EditStateStore;
    __selectionStore?: SelectionStore;
    __history?: History<EditStateSnapshot>;
  };
  w.__mlMap = map;
  w.__editState = editState;
  w.__selectionStore = selectionStore;
  w.__history = history;
}

function applyPreset(next: Preset): void {
  if (next === currentPreset) return;
  currentPreset = next;
  map.setStyle(buildBaseStyle(next), { diff: true });
  presetStandardBtn.setAttribute("aria-pressed", String(next === "standard"));
  presetMonoBtn.setAttribute("aria-pressed", String(next === "mono"));
}
presetStandardBtn.addEventListener("click", () => applyPreset("standard"));
presetMonoBtn.addEventListener("click", () => applyPreset("mono"));

// 選択操作（click / shift+click / 空クリックで clear）
map.on("click", (e) => {
  const pt: [number, number] = [e.point.x, e.point.y];
  const features = map.queryRenderedFeatures(pt, {
    layers: [...HIDEABLE_LAYER_IDS],
  });
  if (features.length === 0) {
    selectionStore.clear();
    return;
  }
  const top = features[0]!;
  const input = {
    sourceLayer: top.sourceLayer ?? "",
    geometry: top.geometry,
    properties: top.properties ?? {},
  };
  const shift = e.originalEvent?.shiftKey ?? false;
  if (shift) {
    selectionStore.toggle(input);
  } else {
    selectionStore.selectOne(input);
  }
});

map.on("mousemove", (e) => {
  const pt: [number, number] = [e.point.x, e.point.y];
  const hit = map.queryRenderedFeatures(pt, { layers: [...HIDEABLE_LAYER_IDS] });
  map.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
});

// ---- アクション ----

function deleteSelected(): void {
  const items = selectionStore.state;
  if (items.length === 0) return;
  const before = editState.snapshot();
  editState.hideMany(
    items.map((i) => ({
      sourceLayer: i.sourceLayer,
      geometry: i.geometry,
      properties: i.properties,
    })),
  );
  selectionStore.clear();
  history.push(before);
}

function resetAllEdits(): void {
  if (editState.state.hidden.length === 0) return;
  const before = editState.snapshot();
  editState.clearAll();
  history.push(before);
}

function undo(): void {
  const prev = history.undo(editState.snapshot());
  if (prev) editState.restore(prev);
}

function redo(): void {
  const next = history.redo(editState.snapshot());
  if (next) editState.restore(next);
}

deleteBtn.addEventListener("click", deleteSelected);
resetEditsBtn.addEventListener("click", resetAllEdits);
undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);

// ---- キーボードショートカット ----

function isTextEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

window.addEventListener("keydown", (e) => {
  if (isTextEditable(e.target)) return;

  if (e.key === "Escape") {
    selectionStore.clear();
    return;
  }

  if (e.key === "Delete" || e.key === "Backspace") {
    if (selectionStore.state.length > 0) {
      e.preventDefault();
      deleteSelected();
    }
    return;
  }

  const meta = e.metaKey || e.ctrlKey;
  if (meta && (e.key === "z" || e.key === "Z")) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (meta && (e.key === "y" || e.key === "Y")) {
    // Windows 流の Redo
    e.preventDefault();
    redo();
  }
});

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  try {
    map.triggerRepaint();
    await new Promise<void>((resolve) => {
      map.once("idle", () => resolve());
    });
    const sourceCanvas = map.getCanvas();
    const credit = "出典：地理院タイル（国土地理院）";
    const composed = composePngWithCredit(sourceCanvas, credit);
    downloadCanvasAsPng(composed, buildExportFilename());
  } finally {
    exportButton.disabled = false;
  }
});

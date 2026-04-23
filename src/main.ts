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
  ensureHighlightOverlay,
  setHighlightOverlayData,
} from "./map/highlightOverlay";
import { attachRubberBand } from "./map/rubberBand";
import { applyLineWidthFactors } from "./map/lineWidth";
import {
  LineWidthStore,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  type LineWidthCategory,
} from "./state/lineWidthStore";
import {
  DEFAULT_VIEW,
  decodeHashToView,
  encodeViewToHash,
  type ViewState,
} from "./state/viewState";
import {
  EditStateStore,
  toHiddenFeatureCollection,
  toHighlightFeatureCollection,
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
const highlightBtn = requireEl("highlight", HTMLButtonElement);
const deleteBtn = requireEl("delete", HTMLButtonElement);
const resetEditsBtn = requireEl("reset-edits", HTMLButtonElement);
const selectionCountEl = requireEl("selection-count", HTMLSpanElement);
const lineWidthToggle = requireEl("line-width-toggle", HTMLButtonElement);
const lineWidthPopover = requireEl("line-width-popover", HTMLElement);
const lineWidthResetBtn = requireEl("line-width-reset", HTMLButtonElement);

const initialView: ViewState = decodeHashToView(window.location.hash) ?? DEFAULT_VIEW;
let currentPreset: Preset = "standard";
const editState = new EditStateStore();
const selectionStore = new SelectionStore();
const history = new History<EditStateSnapshot>();
const lineWidthStore = new LineWidthStore();

const map: MapLibreMap = new maplibregl.Map({
  container: mapRoot,
  style: buildBaseStyle(currentPreset),
  center: [initialView.center.lng, initialView.center.lat],
  zoom: initialView.zoom,
  hash: false,
  attributionControl: false,
  preserveDrawingBuffer: true,
});

// MapLibre デフォルトの shift+drag = box zoom と衝突するので無効化。
// shift+drag は本アプリではラバーバンド選択（#17）に割り当てる。
map.boxZoom.disable();

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
  // 描画順（下 → 上）：base → highlight → hidden mask → selection stroke。
  // 先に addLayer した方が下に入るので、呼び出し順は highlight → hidden → selection。
  // すでに layer がある 2 回目以降は ensure*Overlay が paint/data を更新するのみで、
  // layer 順序は最初の呼び出し順で固定される。
  ensureHighlightOverlay(map, toHighlightFeatureCollection(editState.state.highlighted));
  ensureHiddenOverlay(map, currentPreset, toHiddenFeatureCollection(editState.state.hidden));
  ensureSelectionOverlay(map, toSelectionFeatureCollection(selectionStore.state));
}

map.on("load", () => {
  refreshOverlays();
  applyLineWidthFactors(map, lineWidthStore.factors);
  document.body.dataset["mapReady"] = "true";
});

// preset 切替は setStyle を伴い overlay を飛ばすことがある。
// styledata はその後何度か発火するが、isStyleLoaded() が真になってから
// overlay を復元する（もしくは色を追従させる）。
// line-width factor も preset 切替で初期値に戻るので再適用する。
map.on("styledata", () => {
  if (!map.isStyleLoaded()) return;
  refreshOverlays();
  applyLineWidthFactors(map, lineWidthStore.factors);
});

editState.subscribe((s) => {
  setHiddenOverlayData(map, toHiddenFeatureCollection(s.hidden));
  setHighlightOverlayData(map, toHighlightFeatureCollection(s.highlighted));
  resetEditsBtn.disabled = s.hidden.length === 0 && s.highlighted.length === 0;
});
resetEditsBtn.disabled = true;

function updateSelectionUI(): void {
  const n = selectionStore.state.length;
  selectionCountEl.textContent = n > 0 ? `選択: ${n}` : "";
  setSelectionOverlayData(map, toSelectionFeatureCollection(selectionStore.state));
  deleteBtn.disabled = n === 0;
  highlightBtn.disabled = n === 0;
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
    __lineWidthStore?: LineWidthStore;
  };
  w.__mlMap = map;
  w.__editState = editState;
  w.__selectionStore = selectionStore;
  w.__history = history;
  w.__lineWidthStore = lineWidthStore;
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

// Shift+ドラッグで矩形選択（既存選択に追加）。
attachRubberBand(map, {
  onRelease: (bbox) => {
    const features = map.queryRenderedFeatures(bbox, {
      layers: [...HIDEABLE_LAYER_IDS],
    });
    // 同一 feature が複数レイヤ／タイル境界で重複して返る可能性がある。
    // SelectionStore.add が sourceLayer+geometry で重複排除するため add で流し込む。
    for (const f of features) {
      selectionStore.add({
        sourceLayer: f.sourceLayer ?? "",
        geometry: f.geometry,
        properties: f.properties ?? {},
      });
    }
  },
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

// 選択中の全 feature に強調を適用。すでに全員強調されている場合は解除。
// 混在時（一部強調・一部未強調）は「未強調のものを全て強調」で揃える。
function toggleHighlightSelected(): void {
  const items = selectionStore.state;
  if (items.length === 0) return;
  const before = editState.snapshot();
  const allHighlighted = items.every((i) => editState.isHighlighted(i));
  if (allHighlighted) {
    editState.unhighlightMatching(items);
  } else {
    const missing = items.filter((i) => !editState.isHighlighted(i));
    editState.highlightMany(missing);
  }
  history.push(before);
}

function resetAllEdits(): void {
  const s = editState.state;
  if (s.hidden.length === 0 && s.highlighted.length === 0) return;
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
highlightBtn.addEventListener("click", toggleHighlightSelected);
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

// ---- ライン幅調整 UI ----

const LINE_WIDTH_CATEGORIES: LineWidthCategory[] = ["road", "railway", "river", "boundary"];

function updateLineWidthUI(): void {
  const f = lineWidthStore.factors;
  for (const cat of LINE_WIDTH_CATEGORIES) {
    const valueEl = lineWidthPopover.querySelector(`[data-lw-value="${cat}"]`);
    if (valueEl) valueEl.textContent = `${f[cat].toFixed(2)}×`;
    const decBtn = lineWidthPopover.querySelector(
      `button[data-lw="${cat}"][data-op="dec"]`,
    );
    const incBtn = lineWidthPopover.querySelector(
      `button[data-lw="${cat}"][data-op="inc"]`,
    );
    if (decBtn instanceof HTMLButtonElement) {
      decBtn.disabled = f[cat] <= LINE_WIDTH_MIN + 1e-9;
    }
    if (incBtn instanceof HTMLButtonElement) {
      incBtn.disabled = f[cat] >= LINE_WIDTH_MAX - 1e-9;
    }
  }
}

lineWidthStore.subscribe((f) => {
  applyLineWidthFactors(map, f);
  updateLineWidthUI();
});
updateLineWidthUI();

lineWidthPopover.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const cat = target.getAttribute("data-lw") as LineWidthCategory | null;
  const op = target.getAttribute("data-op");
  if (!cat || !LINE_WIDTH_CATEGORIES.includes(cat)) return;
  if (op === "inc") lineWidthStore.increase(cat);
  else if (op === "dec") lineWidthStore.decrease(cat);
});

lineWidthResetBtn.addEventListener("click", () => {
  lineWidthStore.reset();
});

function setPopoverOpen(open: boolean): void {
  if (open) {
    lineWidthPopover.hidden = false;
    lineWidthToggle.setAttribute("aria-expanded", "true");
  } else {
    lineWidthPopover.hidden = true;
    lineWidthToggle.setAttribute("aria-expanded", "false");
  }
}
lineWidthToggle.addEventListener("click", () => {
  setPopoverOpen(lineWidthPopover.hidden);
});
// ポップオーバー外クリックで閉じる（トグル自身とポップオーバー内クリックは除外）
document.addEventListener("click", (e) => {
  if (lineWidthPopover.hidden) return;
  const t = e.target;
  if (!(t instanceof Node)) return;
  if (lineWidthPopover.contains(t) || lineWidthToggle.contains(t)) return;
  setPopoverOpen(false);
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

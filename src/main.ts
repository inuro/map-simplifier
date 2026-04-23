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
import { EditStateStore, toHiddenFeatureCollection } from "./state/editState";
import { SelectionStore, toSelectionFeatureCollection } from "./state/selectionStore";
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
const resetEditsBtn = requireEl("reset-edits", HTMLButtonElement);
const selectionCountEl = requireEl("selection-count", HTMLSpanElement);

const initialView: ViewState = decodeHashToView(window.location.hash) ?? DEFAULT_VIEW;
let currentPreset: Preset = "standard";
const editState = new EditStateStore();
const selectionStore = new SelectionStore();

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

// 編集状態が変わったら hidden overlay の data を更新。
editState.subscribe((s) => {
  setHiddenOverlayData(map, toHiddenFeatureCollection(s.hidden));
  resetEditsBtn.disabled = s.hidden.length === 0;
});
resetEditsBtn.disabled = true;

// 選択状態が変わったら selection overlay の data と選択数表示を更新。
function updateSelectionUI(): void {
  const n = selectionStore.state.length;
  selectionCountEl.textContent = n > 0 ? `選択: ${n}` : "";
  setSelectionOverlayData(map, toSelectionFeatureCollection(selectionStore.state));
}
selectionStore.subscribe(() => updateSelectionUI());
updateSelectionUI();

if (import.meta.env.DEV) {
  const w = globalThis as unknown as {
    __mlMap?: MapLibreMap;
    __editState?: EditStateStore;
    __selectionStore?: SelectionStore;
  };
  w.__mlMap = map;
  w.__editState = editState;
  w.__selectionStore = selectionStore;
}

function applyPreset(next: Preset): void {
  if (next === currentPreset) return;
  currentPreset = next;
  // source と layer を差分更新で入れ替える。diff: true なら source(タイル)は再取得しない。
  // setStyle → styledata が発火 → refreshOverlays() で overlay 再適用。
  map.setStyle(buildBaseStyle(next), { diff: true });
  presetStandardBtn.setAttribute("aria-pressed", String(next === "standard"));
  presetMonoBtn.setAttribute("aria-pressed", String(next === "mono"));
}
presetStandardBtn.addEventListener("click", () => applyPreset("standard"));
presetMonoBtn.addEventListener("click", () => applyPreset("mono"));

// クリックで feature を選択。shift+click で toggle（追加/解除）。
// 空所クリックは選択解除。
//
// queryRenderedFeatures の第1引数は PointLike（[x, y] or {x, y}）。
// e.point は {x, y} オブジェクトだが、そのまま渡すと MapLibre 内部で
// 「options」として解釈されて viewport 全体走査になるケースがある。
// 明示的に [x, y] 配列化する。
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

// Hideable レイヤ上でポインタを指に変える（クリック可能性の示唆）。
map.on("mousemove", (e) => {
  const pt: [number, number] = [e.point.x, e.point.y];
  const hit = map.queryRenderedFeatures(pt, { layers: [...HIDEABLE_LAYER_IDS] });
  map.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
});

// Esc キーで選択解除。
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    selectionStore.clear();
  }
});

resetEditsBtn.addEventListener("click", () => {
  editState.clearAll();
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

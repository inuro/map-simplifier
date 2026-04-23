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
  DEFAULT_VIEW,
  decodeHashToView,
  encodeViewToHash,
  type ViewState,
} from "./state/viewState";
import { EditStateStore, toHiddenFeatureCollection } from "./state/editState";
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

const initialView: ViewState = decodeHashToView(window.location.hash) ?? DEFAULT_VIEW;
let currentPreset: Preset = "standard";
const editState = new EditStateStore();

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

function refreshOverlay(): void {
  ensureHiddenOverlay(map, currentPreset, toHiddenFeatureCollection(editState.state.hidden));
}

map.on("load", () => {
  // 初回の style ロード後。overlay を最初に差し込む。
  refreshOverlay();
  document.body.dataset["mapReady"] = "true";
});

// preset 切替は setStyle を伴い overlay を飛ばすことがある。
// styledata はその後何度か発火するが、isStyleLoaded() が真になってから
// overlay を復元する（もしくは色を追従させる）。
map.on("styledata", () => {
  if (!map.isStyleLoaded()) return;
  refreshOverlay();
});

// 編集状態が変わったら overlay の source data だけ更新（layer は既存のを再利用）。
editState.subscribe((s) => {
  setHiddenOverlayData(map, toHiddenFeatureCollection(s.hidden));
  resetEditsBtn.disabled = s.hidden.length === 0;
});
resetEditsBtn.disabled = true;

if (import.meta.env.DEV) {
  (globalThis as unknown as { __mlMap?: MapLibreMap; __editState?: EditStateStore }).__mlMap = map;
  (globalThis as unknown as { __mlMap?: MapLibreMap; __editState?: EditStateStore }).__editState =
    editState;
}

function applyPreset(next: Preset): void {
  if (next === currentPreset) return;
  currentPreset = next;
  // source と layer を差分更新で入れ替える。diff: true なら source(タイル)は再取得しない。
  // setStyle → style.load が発火 → refreshOverlay() で overlay 再適用。
  map.setStyle(buildBaseStyle(next), { diff: true });
  presetStandardBtn.setAttribute("aria-pressed", String(next === "standard"));
  presetMonoBtn.setAttribute("aria-pressed", String(next === "mono"));
}
presetStandardBtn.addEventListener("click", () => applyPreset("standard"));
presetMonoBtn.addEventListener("click", () => applyPreset("mono"));

// クリックで最前面 feature を非表示化。
map.on("click", (e) => {
  const features = map.queryRenderedFeatures(e.point, {
    layers: [...HIDEABLE_LAYER_IDS],
  });
  if (features.length === 0) return;
  const top = features[0]!;
  editState.hide({
    sourceLayer: top.sourceLayer ?? "",
    // queryRenderedFeatures の geometry は WGS84 lng/lat で返る。
    geometry: top.geometry,
    properties: top.properties ?? {},
  });
});

// Hideable レイヤ上でポインタを指に変える（クリック可能性の示唆）。
map.on("mousemove", (e) => {
  const hit = map.queryRenderedFeatures(e.point, { layers: [...HIDEABLE_LAYER_IDS] });
  map.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
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

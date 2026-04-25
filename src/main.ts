import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildBaseStyle, HIDEABLE_LAYER_IDS, type Preset } from "./map/style";
import { GSI_ATTRIBUTION } from "./map/gsiSource";
import { registerGsiIdsProtocol } from "./map/idProtocol";
import { HiddenSync } from "./map/hiddenSync";
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
import { applyLayerVisibility } from "./map/layerVisibility";
import {
  SELECTION_HIT_RADIUS_PX,
  screenDistanceToFeature,
  type ProjectFn,
} from "./map/featureDistance";
import {
  centerOfBounds,
  expandBoundsByFactor,
  geometryBounds,
  pointInBounds,
  unionBounds,
  type LngLatBounds,
} from "./map/featureBounds";
import { formatZoomDisplay, lockZoom, unlockZoom, type ZoomLockSnapshot } from "./map/zoomLock";
import {
  LINE_WIDTH_CATEGORIES,
  LineWidthStore,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  type LineWidthCategory,
} from "./state/lineWidthStore";
import {
  LAYER_VISIBILITY_CATEGORIES,
  LayerVisibilityStore,
  isSourceLayerVisible,
  type LayerVisibilityCategory,
} from "./state/layerVisibilityStore";
import {
  DEFAULT_VIEW,
  decodeHashToView,
  encodeViewToHash,
  type ViewState,
} from "./state/viewState";
import { formatLatLng, parseLatLngInput } from "./state/latLngInput";
import {
  EditStateStore,
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
const gotoCoordinateForm = requireEl("goto-coordinate", HTMLFormElement);
const gotoCoordinateInput = requireEl("goto-coordinate-input", HTMLInputElement);
const gotoCoordinateStatus = requireEl("goto-coordinate-status", HTMLSpanElement);
const presetStandardBtn = requireEl("preset-standard", HTMLButtonElement);
const presetMonoBtn = requireEl("preset-mono", HTMLButtonElement);
const undoBtn = requireEl("undo", HTMLButtonElement);
const redoBtn = requireEl("redo", HTMLButtonElement);
const highlightBtn = requireEl("highlight", HTMLButtonElement);
const deleteBtn = requireEl("delete", HTMLButtonElement);
const deleteInverseBtn = requireEl("delete-inverse", HTMLButtonElement);
const resetEditsBtn = requireEl("reset-edits", HTMLButtonElement);
const selectionCountEl = requireEl("selection-count", HTMLSpanElement);
const layerVisibilityToggle = requireEl("layer-visibility-toggle", HTMLButtonElement);
const layerVisibilityPopover = requireEl("layer-visibility-popover", HTMLElement);
const lineWidthResetBtn = requireEl("line-width-reset", HTMLButtonElement);
const appVersionEl = requireEl("app-version", HTMLSpanElement);
const zoomDisplayEl = requireEl("zoom-display", HTMLSpanElement);

// Vite の define で package.json.version から注入される。
appVersionEl.textContent = `v${__APP_VERSION__}`;

const initialView: ViewState = decodeHashToView(window.location.hash) ?? DEFAULT_VIEW;
let currentPreset: Preset = "standard";
const editState = new EditStateStore();
const selectionStore = new SelectionStore();
const history = new History<EditStateSnapshot>();
const lineWidthStore = new LineWidthStore();
const layerVisibilityStore = new LayerVisibilityStore();

// GSI タイルに feature.id を注入する独自プロトコル。Map コンストラクタより前に登録する。
registerGsiIdsProtocol(maplibregl);

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

function setCoordinateStatus(kind: "idle" | "error" | "success", message: string): void {
  gotoCoordinateStatus.textContent = message;
  if (kind === "idle") {
    gotoCoordinateStatus.removeAttribute("data-kind");
    gotoCoordinateInput.removeAttribute("aria-invalid");
    return;
  }
  gotoCoordinateStatus.dataset["kind"] = kind;
  if (kind === "error") {
    gotoCoordinateInput.setAttribute("aria-invalid", "true");
  } else {
    gotoCoordinateInput.removeAttribute("aria-invalid");
  }
}

gotoCoordinateInput.addEventListener("input", () => {
  if (gotoCoordinateInput.getAttribute("aria-invalid") === "true") {
    setCoordinateStatus("idle", "");
  }
});

gotoCoordinateForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const target = parseLatLngInput(gotoCoordinateInput.value);
  if (!target) {
    setCoordinateStatus("error", "緯度, 経度で入力");
    gotoCoordinateInput.select();
    return;
  }
  gotoCoordinateInput.value = formatLatLng(target);
  map.jumpTo({
    center: [target.lng, target.lat],
    zoom: map.getZoom(),
  });
  syncHash();
  setCoordinateStatus("success", "移動しました");
});

const hiddenSync = new HiddenSync({
  map,
  getHidden: () => editState.state.hidden,
});

function refreshNonHiddenOverlays(): void {
  // highlight → selection の順で重ねる。hidden は feature-state に寄せたので overlay 不要。
  // highlight は preset に応じて色が変わるので、毎回 currentPreset を渡して paint を追従させる。
  ensureHighlightOverlay(
    map,
    currentPreset,
    toHighlightFeatureCollection(
      editState.state.highlighted.filter((f) =>
        isSourceLayerVisible(f.sourceLayer, layerVisibilityStore.state),
      ),
    ),
  );
  ensureSelectionOverlay(
    map,
    toSelectionFeatureCollection(
      selectionStore.state.filter((f) =>
        isSourceLayerVisible(f.sourceLayer, layerVisibilityStore.state),
      ),
    ),
  );
}

map.on("load", () => {
  refreshNonHiddenOverlays();
  applyLayerVisibility(map, layerVisibilityStore.state);
  applyLineWidthFactors(map, lineWidthStore.factors);
  hiddenSync.syncAll();
  updateZoomDisplay();
  document.body.dataset["mapReady"] = "true";
});

// preset 切替は setStyle を伴い overlay を飛ばすことがある。
// styledata はその後何度か発火するが、isStyleLoaded() が真になってから復元する。
map.on("styledata", () => {
  if (!map.isStyleLoaded()) return;
  refreshNonHiddenOverlays();
  applyLayerVisibility(map, layerVisibilityStore.state);
  applyLineWidthFactors(map, lineWidthStore.factors);
  hiddenSync.syncAll();
});

// 新しいタイルがロードされたときに hidden 同期を再適用。
// sourcedata は多重発火するが syncAll は冪等なので問題ない。
map.on("sourcedata", (e) => {
  if (e.sourceId !== "gsi") return;
  if (!e.isSourceLoaded) return;
  hiddenSync.syncAll();
});

// zoom や pan で「cache 済み」のタイルに戻った場合、sourcedata が発火しない
// ケースがあるため、idle（描画が落ち着いた時）でも同期を行う。冪等。
map.on("idle", () => {
  hiddenSync.syncAll();
});

// 編集中（hidden / highlighted のいずれかが非空）はズームを現行に固定する。#35
// GSI タイルにはグローバル feature ID が無く、ズーム間で feature の geometry が
// 別物に simplify されるため、ズーム変更は editState の追跡を破壊する。
let zoomLockSnapshot: ZoomLockSnapshot | null = null;

function isEditingActive(): boolean {
  const s = editState.state;
  return s.hidden.length > 0 || s.highlighted.length > 0;
}

function refreshZoomLock(): void {
  const editing = isEditingActive();
  if (editing && zoomLockSnapshot === null) {
    zoomLockSnapshot = lockZoom(map);
  } else if (!editing && zoomLockSnapshot !== null) {
    unlockZoom(map, zoomLockSnapshot);
    zoomLockSnapshot = null;
  }
  updateZoomDisplay();
}

function updateZoomDisplay(): void {
  const locked = zoomLockSnapshot !== null;
  zoomDisplayEl.textContent = formatZoomDisplay(map.getZoom(), locked);
  zoomDisplayEl.dataset["locked"] = locked ? "true" : "false";
}

editState.subscribe((s) => {
  setHighlightOverlayData(
    map,
    toHighlightFeatureCollection(
      s.highlighted.filter((f) =>
        isSourceLayerVisible(f.sourceLayer, layerVisibilityStore.state),
      ),
    ),
  );
  hiddenSync.syncAll();
  resetEditsBtn.disabled = s.hidden.length === 0 && s.highlighted.length === 0;
  refreshZoomLock();
});
resetEditsBtn.disabled = true;
map.on("zoom", updateZoomDisplay);
map.on("zoomend", updateZoomDisplay);

function updateSelectionUI(): void {
  const n = selectionStore.state.length;
  selectionCountEl.textContent = n > 0 ? `選択: ${n}` : "";
  setSelectionOverlayData(
    map,
    toSelectionFeatureCollection(
      selectionStore.state.filter((f) =>
        isSourceLayerVisible(f.sourceLayer, layerVisibilityStore.state),
      ),
    ),
  );
  deleteBtn.disabled = n === 0;
  deleteInverseBtn.disabled = n < 2;
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
    __layerVisibilityStore?: LayerVisibilityStore;
  };
  w.__mlMap = map;
  w.__editState = editState;
  w.__selectionStore = selectionStore;
  w.__history = history;
  w.__lineWidthStore = lineWidthStore;
  w.__layerVisibilityStore = layerVisibilityStore;
}

function applyPreset(next: Preset): void {
  if (next === currentPreset) return;
  currentPreset = next;
  map.setStyle(buildBaseStyle(next), { diff: true });
  // setStyle({ diff: true }) は custom source/layer を取り去ったうえで
  // styledata を isStyleLoaded=false のまま 1 回だけ発火し、isStyleLoaded=true の
  // styledata が後から来ないケースがある（実測）。既存の styledata ハンドラは
  // isStyleLoaded ガードで早期 return するため overlay が復元されず、特に mono では
  // 選択の橙縁取りが消失したまま戻らない症状になっていた。
  // style が落ち着く idle を一度だけ待って、確実に overlay 群を再構築する。
  map.once("idle", () => {
    refreshNonHiddenOverlays();
    applyLayerVisibility(map, layerVisibilityStore.state);
    applyLineWidthFactors(map, lineWidthStore.factors);
    hiddenSync.syncAll();
  });
  presetStandardBtn.setAttribute("aria-pressed", String(next === "standard"));
  presetMonoBtn.setAttribute("aria-pressed", String(next === "mono"));
}
presetStandardBtn.addEventListener("click", () => applyPreset("standard"));
presetMonoBtn.addEventListener("click", () => applyPreset("mono"));

// 選択対象は「hidden でない feature」のみ。hidden は opacity 0 で描画されるが
// queryRenderedFeatures は不可視でも返すため、明示的にフィルタする。
function filterVisible<T extends { sourceLayer?: string; geometry: import("geojson").Geometry }>(
  features: ReadonlyArray<T>,
): T[] {
  return features.filter(
    (f) =>
      isSourceLayerVisible(f.sourceLayer ?? "", layerVisibilityStore.state) &&
      !editState.isHidden({ sourceLayer: f.sourceLayer ?? "", geometry: f.geometry }),
  );
}

// クリック位置を中心とした小さな bbox を作る。#30
// 点 query だと線系 feature（道路・鉄道・河川・境界）が線芯ピクセル上以外で拾えないので、
// SELECTION_HIT_RADIUS_PX の許容範囲で拾ってから screen 距離で最近傍を選ぶ。
function hitBox(
  x: number,
  y: number,
  r: number,
): [[number, number], [number, number]] {
  return [
    [x - r, y - r],
    [x + r, y + r],
  ];
}

const projectLngLat: ProjectFn = (lng, lat) => {
  const p = map.project([lng, lat]);
  return { x: p.x, y: p.y };
};

function pickNearest<
  T extends { sourceLayer?: string; geometry: import("geojson").Geometry },
>(features: ReadonlyArray<T>, x: number, y: number): T | null {
  if (features.length === 0) return null;
  const p = { x, y };
  let best: T | null = null;
  let bestDist = Infinity;
  for (const f of features) {
    const d = screenDistanceToFeature(p, f.geometry, projectLngLat);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

// 選択操作（click / shift+click / 空クリックで clear）
map.on("click", (e) => {
  const bbox = hitBox(e.point.x, e.point.y, SELECTION_HIT_RADIUS_PX);
  const raw = map.queryRenderedFeatures(bbox, { layers: [...HIDEABLE_LAYER_IDS] });
  const features = filterVisible(raw);
  const top = pickNearest(features, e.point.x, e.point.y);
  if (!top) {
    selectionStore.clear();
    return;
  }
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
  const bbox = hitBox(e.point.x, e.point.y, SELECTION_HIT_RADIUS_PX);
  const raw = map.queryRenderedFeatures(bbox, { layers: [...HIDEABLE_LAYER_IDS] });
  const hit = filterVisible(raw);
  map.getCanvas().style.cursor = hit.length > 0 ? "pointer" : "";
});

// Shift+ドラッグで矩形選択（既存選択に追加）。
attachRubberBand(map, {
  onRelease: (bbox) => {
    const raw = map.queryRenderedFeatures(bbox, { layers: [...HIDEABLE_LAYER_IDS] });
    const features = filterVisible(raw);
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
  editState.unhighlightMatching(items);
  selectionStore.clear();
  history.push(before);
}

// 選択 feature を包む lng-lat BBox A の中心を保ったまま辺を 2 倍（面積 4 倍）にした
// BBox B を作り、B 内の hideable feature のうち選択以外を一括 hidden にする。#33
// 4 倍は経験的に「残したい対象の周辺」を示す妥当な広さ。実運用で要調整。
const INVERSE_DELETE_BOUNDS_LINEAR_FACTOR = 2;

function deleteInverseOfSelected(): void {
  const items = selectionStore.state;
  if (items.length < 2) return;

  // 選択 feature ごとの (sourceLayer, BBox) を保持しておく。
  // タイル境界で同じ論理 feature が partial 別 geometry として返ってくるケースで、
  // 「sourceLayer 一致 + 中心点が選択 BBox 内」のものを除外して保護する（#35）。
  const selectedBoundsByLayer = new Map<string, LngLatBounds[]>();
  const itemBounds: LngLatBounds[] = [];
  for (const i of items) {
    const b = geometryBounds(i.geometry);
    if (!b) continue;
    itemBounds.push(b);
    const list = selectedBoundsByLayer.get(i.sourceLayer);
    if (list) list.push(b);
    else selectedBoundsByLayer.set(i.sourceLayer, [b]);
  }
  const a = unionBounds(itemBounds);
  if (!a) return;
  const b = expandBoundsByFactor(a, INVERSE_DELETE_BOUNDS_LINEAR_FACTOR);

  // lng-lat の B を screen 座標 AABB に project（緯度は y が反転するので min/max を取る）。
  const p1 = map.project([b[0], b[1]]);
  const p2 = map.project([b[2], b[3]]);
  const screenBbox: [[number, number], [number, number]] = [
    [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
    [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
  ];
  const raw = map.queryRenderedFeatures(screenBbox, {
    layers: [...HIDEABLE_LAYER_IDS],
  });

  const selectedKeys = new Set(
    items.map((i) => `${i.sourceLayer}::${JSON.stringify(i.geometry)}`),
  );
  const seen = new Set<string>();
  const targets: { sourceLayer: string; geometry: import("geojson").Geometry; properties: Record<string, unknown> }[] = [];
  for (const f of raw) {
    const sourceLayer = f.sourceLayer ?? "";
    const k = `${sourceLayer}::${JSON.stringify(f.geometry)}`;
    if (selectedKeys.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!isSourceLayerVisible(sourceLayer, layerVisibilityStore.state)) continue;
    if (editState.isHidden({ sourceLayer, geometry: f.geometry })) continue;

    // partial 保護：candidate の bbox 中心が同じ sourceLayer の選択 BBox に含まれるなら
    // 選択 feature の partial 部分とみなして除外。
    const cb = geometryBounds(f.geometry);
    if (cb) {
      const center = centerOfBounds(cb);
      const protectList = selectedBoundsByLayer.get(sourceLayer);
      if (protectList && protectList.some((pb) => pointInBounds(center, pb))) {
        continue;
      }
    }

    targets.push({
      sourceLayer,
      geometry: f.geometry,
      properties: f.properties ?? {},
    });
  }

  if (targets.length === 0) return;
  const before = editState.snapshot();
  editState.hideMany(targets);
  // 選択は維持。「選択した対象を残し、それ以外を消す」機能なので選択クリアは不要。
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
deleteInverseBtn.addEventListener("click", deleteInverseOfSelected);
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

// ---- レイヤ表示 / ライン幅調整 UI ----

function updateLayerVisibilityUI(): void {
  const state = layerVisibilityStore.state;
  for (const category of LAYER_VISIBILITY_CATEGORIES) {
    const input = layerVisibilityPopover.querySelector(
      `input[data-layer-visibility="${category.id}"]`,
    );
    if (input instanceof HTMLInputElement) {
      input.checked = state[category.id];
    }
  }
}

layerVisibilityStore.subscribe((state) => {
  applyLayerVisibility(map, state);
  selectionStore.clear();
  refreshNonHiddenOverlays();
  updateLayerVisibilityUI();
});
updateLayerVisibilityUI();

layerVisibilityPopover.addEventListener("change", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement)) return;
  const category = target.getAttribute(
    "data-layer-visibility",
  ) as LayerVisibilityCategory | null;
  if (!category || !LAYER_VISIBILITY_CATEGORIES.some((c) => c.id === category)) return;
  layerVisibilityStore.set(category, target.checked);
});

function setLayerVisibilityPopoverOpen(open: boolean): void {
  if (open) {
    layerVisibilityPopover.hidden = false;
    layerVisibilityToggle.setAttribute("aria-expanded", "true");
  } else {
    layerVisibilityPopover.hidden = true;
    layerVisibilityToggle.setAttribute("aria-expanded", "false");
  }
}
layerVisibilityToggle.addEventListener("click", () => {
  setLayerVisibilityPopoverOpen(layerVisibilityPopover.hidden);
});
document.addEventListener("click", (e) => {
  if (layerVisibilityPopover.hidden) return;
  const t = e.target;
  if (!(t instanceof Node)) return;
  if (layerVisibilityPopover.contains(t) || layerVisibilityToggle.contains(t)) return;
  setLayerVisibilityPopoverOpen(false);
});

function updateLineWidthUI(): void {
  const f = lineWidthStore.factors;
  for (const cat of LINE_WIDTH_CATEGORIES) {
    const valueEl = layerVisibilityPopover.querySelector(`[data-lw-value="${cat}"]`);
    if (valueEl) valueEl.textContent = `${f[cat].toFixed(2)}×`;
    const decBtn = layerVisibilityPopover.querySelector(
      `button[data-lw="${cat}"][data-op="dec"]`,
    );
    const incBtn = layerVisibilityPopover.querySelector(
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

layerVisibilityPopover.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const cat = target.getAttribute("data-lw") as LineWidthCategory | null;
  const op = target.getAttribute("data-op");
  if (!cat || !(LINE_WIDTH_CATEGORIES as readonly string[]).includes(cat)) return;
  if (op === "inc") lineWidthStore.increase(cat);
  else if (op === "dec") lineWidthStore.decrease(cat);
});

lineWidthResetBtn.addEventListener("click", () => {
  lineWidthStore.reset();
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

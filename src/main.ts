import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildBaseStyle } from "./map/style";
import { GSI_ATTRIBUTION } from "./map/gsiSource";
import {
  DEFAULT_VIEW,
  decodeHashToView,
  encodeViewToHash,
  type ViewState,
} from "./state/viewState";
import { buildExportFilename, composePngWithCredit, downloadCanvasAsPng } from "./export/png";

const mapRoot = document.getElementById("map");
const exportButton = document.getElementById("export-png");
if (!mapRoot || !(mapRoot instanceof HTMLElement)) {
  throw new Error("missing #map container");
}
if (!(exportButton instanceof HTMLButtonElement)) {
  throw new Error("missing #export-png button");
}

const initialView: ViewState = decodeHashToView(window.location.hash) ?? DEFAULT_VIEW;

const map: MapLibreMap = new maplibregl.Map({
  container: mapRoot,
  style: buildBaseStyle(),
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

map.on("load", () => {
  document.body.dataset["mapReady"] = "true";
});

if (import.meta.env.DEV) {
  (globalThis as unknown as { __mlMap?: MapLibreMap }).__mlMap = map;
}

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

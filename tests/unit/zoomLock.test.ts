import { describe, expect, it, vi } from "vitest";
import type { Map as MapLibreMap } from "maplibre-gl";
import { formatZoomDisplay, lockZoom, unlockZoom } from "../../src/map/zoomLock";

function fakeMap(initial: { zoom: number; minZoom: number; maxZoom: number }) {
  let zoom = initial.zoom;
  let minZoom = initial.minZoom;
  let maxZoom = initial.maxZoom;
  return {
    getZoom: vi.fn(() => zoom),
    getMinZoom: vi.fn(() => minZoom),
    getMaxZoom: vi.fn(() => maxZoom),
    setMinZoom: vi.fn((v: number) => {
      minZoom = v;
    }),
    setMaxZoom: vi.fn((v: number) => {
      maxZoom = v;
    }),
    _read: () => ({ zoom, minZoom, maxZoom }),
  };
}

describe("lockZoom / unlockZoom", () => {
  it("ロックは min/max を現在ズームに揃え、unlock で元に戻る", () => {
    const m = fakeMap({ zoom: 15.5, minZoom: 0, maxZoom: 22 });
    const snap = lockZoom(m as unknown as MapLibreMap);
    expect(snap).toEqual({ minZoom: 0, maxZoom: 22 });
    expect(m._read()).toEqual({ zoom: 15.5, minZoom: 15.5, maxZoom: 15.5 });

    unlockZoom(m as unknown as MapLibreMap, snap);
    expect(m._read()).toEqual({ zoom: 15.5, minZoom: 0, maxZoom: 22 });
  });

  it("既に部分的に制限されているケースでも snapshot 通りに戻る", () => {
    const m = fakeMap({ zoom: 14, minZoom: 10, maxZoom: 18 });
    const snap = lockZoom(m as unknown as MapLibreMap);
    expect(m._read()).toEqual({ zoom: 14, minZoom: 14, maxZoom: 14 });

    unlockZoom(m as unknown as MapLibreMap, snap);
    expect(m._read()).toEqual({ zoom: 14, minZoom: 10, maxZoom: 18 });
  });
});

describe("formatZoomDisplay", () => {
  it("通常表示は Z {小数2桁}", () => {
    expect(formatZoomDisplay(15, false)).toBe("Z 15.00");
    expect(formatZoomDisplay(15.327, false)).toBe("Z 15.33");
  });

  it("ロック中は鍵マーク付き", () => {
    expect(formatZoomDisplay(15.5, true)).toBe("Z 15.50 🔒");
  });
});

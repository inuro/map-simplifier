import { describe, expect, it } from "vitest";
import {
  buildBaseStyle,
  HIDEABLE_LAYER_IDS,
  PALETTES,
  PRESETS,
  type Preset,
} from "../../src/map/style";

// HEX -> {r,g,b} に分解して、R==G==B（グレースケール）かを判定するヘルパ。
function isGrayscaleHex(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return r === g && g === b;
}

function isNeutralColorString(color: string): boolean {
  return isGrayscaleHex(color) || color === "rgba(0,0,0,0)";
}

describe("style presets", () => {
  it("exposes the available presets", () => {
    expect(PRESETS).toEqual(["standard", "mono"]);
  });

  it("defaults to 'standard' when no arg is passed (backward compat)", () => {
    const def = buildBaseStyle();
    const std = buildBaseStyle("standard");
    expect(def).toEqual(std);
  });

  it.each<[Preset, string]>([
    ["standard", "map-simplifier-standard"],
    ["mono", "map-simplifier-mono"],
  ])("preset %s has style name %s", (preset, expected) => {
    expect(buildBaseStyle(preset).name).toBe(expected);
  });

  it("preset 'mono' has all fill-color / line-color as grayscale hex", () => {
    const s = buildBaseStyle("mono");
    const offending: string[] = [];
    for (const layer of s.layers) {
      const paint = ("paint" in layer ? layer.paint : undefined) as
        | Record<string, unknown>
        | undefined;
      if (!paint) continue;
      for (const key of ["fill-color", "line-color", "background-color", "fill-outline-color"]) {
        const v = paint[key];
        if (typeof v === "string") {
          if (!isNeutralColorString(v)) {
            offending.push(`${layer.id}.${key}=${v}`);
          }
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it("preset 'mono' keeps the source config and attribution intact", () => {
    const s = buildBaseStyle("mono");
    expect(s.sources.gsi).toBeDefined();
    // attribution は metadata に詰めている
    expect(s.metadata).toMatchObject({ attribution: expect.stringMatching(/地理院/) });
  });

  it("uses optimal_bvmap-v1 road center and road edge layers separately", () => {
    const s = buildBaseStyle("standard");
    const byId = new Map(s.layers.map((layer) => [layer.id, layer]));
    expect(byId.get("road-line")).toMatchObject({ "source-layer": "RdCL" });
    expect(byId.get("road-edge-line")).toMatchObject({ "source-layer": "RdEdg" });
    expect(byId.get("road-component-line")).toMatchObject({ "source-layer": "RdCompt" });
    expect(byId.get("building-outline-line")).toMatchObject({ "source-layer": "BldA" });
    expect(byId.get("waterarea-outline-line")).toMatchObject({ "source-layer": "WA" });
    expect(HIDEABLE_LAYER_IDS).toContain("road-edge-line");
    expect(HIDEABLE_LAYER_IDS).toContain("road-component-line");
    expect(HIDEABLE_LAYER_IDS).toContain("building-outline-line");
  });

  it("preset 'mono' has grayscale highlight colors (fill and stroke)", () => {
    const p = PALETTES["mono"];
    expect(isGrayscaleHex(p.highlightFill)).toBe(true);
    expect(isGrayscaleHex(p.highlightStroke)).toBe(true);
  });

  it("preset 'standard' keeps a chromatic (non-grayscale) highlight", () => {
    // 紙面カラー用途で目立つ赤系を維持。グレースケールではないことを確認する
    // （#d93b3b のような R=G=B 以外の HEX）。
    const p = PALETTES["standard"];
    expect(isGrayscaleHex(p.highlightFill)).toBe(false);
    expect(isGrayscaleHex(p.highlightStroke)).toBe(false);
  });

  it("preset 'mono' uses a stronger highlight fill opacity than 'standard'", () => {
    // 彩度の無い mono では塗りが薄いと「枠線だけ強調されて見える」ので、
    // standard より高い fill-opacity を使う設計。
    expect(PALETTES["mono"].highlightFillOpacity).toBeGreaterThan(
      PALETTES["standard"].highlightFillOpacity,
    );
    // 許容範囲（0〜1 の確率値）
    for (const p of Object.values(PALETTES)) {
      expect(p.highlightFillOpacity).toBeGreaterThanOrEqual(0);
      expect(p.highlightFillOpacity).toBeLessThanOrEqual(1);
    }
  });
});

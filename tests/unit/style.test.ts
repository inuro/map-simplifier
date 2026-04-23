import { describe, expect, it } from "vitest";
import { buildBaseStyle, PRESETS, type Preset } from "../../src/map/style";

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
          if (!isGrayscaleHex(v)) {
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
});

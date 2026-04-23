import { describe, expect, it, vi } from "vitest";
import { buildExportFilename, composePngWithCredit } from "../../src/export/png";

describe("buildExportFilename", () => {
  it("uses map-simplifier prefix + ISO-like timestamp + .png", () => {
    const d = new Date("2026-04-22T09:05:03Z");
    expect(buildExportFilename(d)).toBe("map-simplifier-20260422-090503.png");
  });

  it("pads single-digit month/day/time components", () => {
    const d = new Date("2026-01-02T03:04:05Z");
    expect(buildExportFilename(d)).toBe("map-simplifier-20260102-030405.png");
  });
});

describe("composePngWithCredit", () => {
  // source canvas を渡すと、下部にクレジット帯を追加した新しい canvas を返す。
  // 実ブラウザの HTMLCanvasElement は jsdom だと getContext('2d') が動かないので、
  // 必要最小限のダックタイピングしたモックを渡す。

  function makeMockCtx() {
    return {
      fillStyle: "",
      font: "",
      textBaseline: "",
      textAlign: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
    };
  }

  function makeMockCanvas(w: number, h: number) {
    const ctx = makeMockCtx();
    return {
      width: w,
      height: h,
      getContext: vi.fn(() => ctx),
      _ctx: ctx,
    };
  }

  it("returns a canvas taller than the source by the credit strip height", () => {
    const source = makeMockCanvas(800, 600) as unknown as HTMLCanvasElement;
    const factory = ((): HTMLCanvasElement => makeMockCanvas(0, 0) as unknown as HTMLCanvasElement);
    const out = composePngWithCredit(source, "出典：地理院タイル", { createCanvas: factory });
    expect(out.width).toBe(800);
    expect(out.height).toBeGreaterThan(600);
  });

  it("draws the source image and writes the credit text", () => {
    const source = makeMockCanvas(400, 300) as unknown as HTMLCanvasElement;
    const target = makeMockCanvas(0, 0);
    const factory = ((): HTMLCanvasElement => target as unknown as HTMLCanvasElement);
    composePngWithCredit(source, "出典：地理院タイル", { createCanvas: factory });
    expect(target._ctx.drawImage).toHaveBeenCalledWith(source, 0, 0);
    expect(target._ctx.fillText).toHaveBeenCalled();
    const call = target._ctx.fillText.mock.calls[0]!;
    expect(call[0]).toBe("出典：地理院タイル");
  });
});

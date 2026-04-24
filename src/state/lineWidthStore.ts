/**
 * ライン幅の調整 factor を保持する store。
 *
 * レイヤ表示カテゴリごとに 1.0 を基準とする倍率。
 * +/- は幾何級数（×1.25 / ÷1.25）、クランプは [0.2, 8.0]。
 *
 * 履歴（Undo/Redo）には乗せない — view 設定的な扱い（#24 設計判断）。
 */

import type { LayerVisibilityCategory } from "./layerVisibilityStore";

export type LineWidthCategory = LayerVisibilityCategory;

export const LINE_WIDTH_CATEGORIES = [
  "water",
  "road",
  "roadEdge",
  "railway",
  "building",
  "boundary",
] as const satisfies readonly LineWidthCategory[];

export type LineWidthFactors = Record<LineWidthCategory, number>;

export const DEFAULT_LINE_WIDTH_FACTORS: LineWidthFactors = {
  water: 1,
  road: 1,
  roadEdge: 1,
  railway: 1,
  building: 1,
  boundary: 1,
};

export const LINE_WIDTH_STEP = 1.25;
export const LINE_WIDTH_MIN = 0.2;
export const LINE_WIDTH_MAX = 8.0;

type Listener = (f: LineWidthFactors) => void;

function clamp(x: number): number {
  return Math.min(LINE_WIDTH_MAX, Math.max(LINE_WIDTH_MIN, x));
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

export class LineWidthStore {
  private _factors: LineWidthFactors = { ...DEFAULT_LINE_WIDTH_FACTORS };
  private _listeners = new Set<Listener>();

  get factors(): Readonly<LineWidthFactors> {
    return { ...this._factors };
  }

  increase(key: LineWidthCategory): void {
    const next = clamp(this._factors[key] * LINE_WIDTH_STEP);
    if (nearlyEqual(next, this._factors[key])) return;
    this._factors[key] = next;
    this._emit();
  }

  decrease(key: LineWidthCategory): void {
    const next = clamp(this._factors[key] / LINE_WIDTH_STEP);
    if (nearlyEqual(next, this._factors[key])) return;
    this._factors[key] = next;
    this._emit();
  }

  reset(): void {
    const def = DEFAULT_LINE_WIDTH_FACTORS;
    if (LINE_WIDTH_CATEGORIES.every((c) => nearlyEqual(this._factors[c], def[c]))) {
      return;
    }
    this._factors = { ...def };
    this._emit();
  }

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _emit(): void {
    const snapshot = this.factors;
    for (const l of this._listeners) l(snapshot);
  }
}

/**
 * MapLibre の line-width 値（数値または interpolate 式）を倍率でスケール。
 *
 * interpolate 式は ["interpolate", ["linear"], ["zoom"], z1, v1, z2, v2, ...] の形を想定し、
 * 値の stop 部分だけに factor を掛けた式を返す。
 */
export function scaleLineWidth(
  base: number | unknown[],
  factor: number,
): number | unknown[] {
  if (typeof base === "number") {
    return base * factor;
  }
  if (Array.isArray(base) && base[0] === "interpolate") {
    const out: unknown[] = [base[0], base[1], base[2]];
    for (let i = 3; i < base.length; i += 2) {
      const zoom = base[i];
      const val = base[i + 1];
      out.push(zoom);
      out.push(typeof val === "number" ? val * factor : val);
    }
    return out;
  }
  return base;
}

import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";

/**
 * Shift+ドラッグによる矩形選択（ラバーバンド）。
 *
 * - shift + mousedown で開始。map.dragPan を無効化してパンを抑止。
 * - mousemove で矩形 div を更新表示。
 * - mouseup でコールバックに bbox を渡す。MapLibre 側で
 *   queryRenderedFeatures を呼ぶのは呼び出し側の責任。
 * - ドラッグ距離が MIN_DRAG_PX 未満ならキャンセル（通常の shift+click に委ねる）。
 * - Esc / window の mouseup（キャンバス外で離した場合）でもキャンセル。
 */

export interface RubberBandCallbacks {
  /**
   * 有効なドラッグが完了したときに呼ばれる。
   * bbox は [[minX, minY], [maxX, maxY]] の screen pixel 座標（map canvas 基準）。
   */
  onRelease(bbox: [[number, number], [number, number]]): void;
}

const MIN_DRAG_PX = 5;

export function attachRubberBand(
  map: MapLibreMap,
  cb: RubberBandCallbacks,
): () => void {
  const container = map.getContainer();
  const box = document.createElement("div");
  box.setAttribute("data-testid", "rubber-band");
  Object.assign(box.style, {
    position: "absolute",
    pointerEvents: "none",
    border: "1.5px dashed #ff8800",
    background: "rgba(255, 136, 0, 0.12)",
    zIndex: "5",
    display: "none",
    left: "0",
    top: "0",
    width: "0",
    height: "0",
  });
  container.appendChild(box);

  let start: { x: number; y: number } | null = null;

  function onDown(e: MapMouseEvent): void {
    if (!e.originalEvent.shiftKey) return;
    start = { x: e.point.x, y: e.point.y };
    map.dragPan.disable();
  }

  function onMove(e: MapMouseEvent): void {
    if (!start) return;
    const left = Math.min(start.x, e.point.x);
    const top = Math.min(start.y, e.point.y);
    const w = Math.abs(e.point.x - start.x);
    const h = Math.abs(e.point.y - start.y);
    box.style.display = "block";
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
  }

  function finalize(endPt: { x: number; y: number } | null): void {
    if (!start) return;
    const s = start;
    start = null;
    box.style.display = "none";
    map.dragPan.enable();
    if (!endPt) return;
    const dx = endPt.x - s.x;
    const dy = endPt.y - s.y;
    if (Math.hypot(dx, dy) < MIN_DRAG_PX) return;
    const p1: [number, number] = [Math.min(s.x, endPt.x), Math.min(s.y, endPt.y)];
    const p2: [number, number] = [Math.max(s.x, endPt.x), Math.max(s.y, endPt.y)];
    cb.onRelease([p1, p2]);
  }

  function onUp(e: MapMouseEvent): void {
    finalize(e.point);
  }

  function onWindowUp(): void {
    // map canvas 外で離された場合のフェイルセーフ。bbox 確定はしない。
    if (start) finalize(null);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && start) finalize(null);
  }

  map.on("mousedown", onDown);
  map.on("mousemove", onMove);
  map.on("mouseup", onUp);
  window.addEventListener("mouseup", onWindowUp);
  window.addEventListener("keydown", onKeyDown);

  return () => {
    map.off("mousedown", onDown);
    map.off("mousemove", onMove);
    map.off("mouseup", onUp);
    window.removeEventListener("mouseup", onWindowUp);
    window.removeEventListener("keydown", onKeyDown);
    box.remove();
  };
}

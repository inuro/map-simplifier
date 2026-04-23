import { describe, expect, it, vi } from "vitest";
import { History } from "../../src/state/history";

describe("History<T>", () => {
  it("starts with no undo/redo available", () => {
    const h = new History<number>();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it("push enables undo and clears redo", () => {
    const h = new History<number>();
    h.push(1);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
    // Do an undo to put something in redo stack, then push again: redo should clear
    const prev = h.undo(2);
    expect(prev).toBe(1);
    expect(h.canRedo).toBe(true);
    h.push(99);
    expect(h.canRedo).toBe(false);
  });

  it("undo returns the last pushed snapshot and moves current to redo stack", () => {
    const h = new History<string>();
    h.push("a");
    h.push("b");
    expect(h.undo("current")).toBe("b");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(true);
    expect(h.undo("was_b")).toBe("a");
    expect(h.canUndo).toBe(false);
  });

  it("undo returns null when stack is empty", () => {
    const h = new History<number>();
    expect(h.undo(0)).toBeNull();
  });

  it("redo returns the last undone snapshot and moves current to undo stack", () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    h.undo(3); // undo to 2, current=3 pushed to redo
    h.undo(2); // undo to 1, current=2 pushed to redo
    expect(h.canUndo).toBe(false);
    expect(h.redo(1)).toBe(2);
    expect(h.canUndo).toBe(true);
    expect(h.redo(2)).toBe(3);
    expect(h.canRedo).toBe(false);
  });

  it("redo returns null when stack is empty", () => {
    const h = new History<number>();
    expect(h.redo(0)).toBeNull();
  });

  it("subscribe fires on push/undo/redo with canUndo/canRedo snapshot", () => {
    const h = new History<number>();
    const listener = vi.fn();
    h.subscribe(listener);
    h.push(1);
    expect(listener).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
    h.undo(2);
    expect(listener).toHaveBeenLastCalledWith({ canUndo: false, canRedo: true });
    h.redo(1);
    expect(listener).toHaveBeenLastCalledWith({ canUndo: true, canRedo: false });
  });

  it("subscribe returns unsubscribe function", () => {
    const h = new History<number>();
    const l = vi.fn();
    const off = h.subscribe(l);
    h.push(1);
    expect(l).toHaveBeenCalledTimes(1);
    off();
    h.push(2);
    expect(l).toHaveBeenCalledTimes(1);
  });
});

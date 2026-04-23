/**
 * 汎用の Undo/Redo 履歴。snapshot ベース。
 *
 * 呼び出し側が push(snapshotBeforeAction) してから状態を変更。
 * undo(current) は直前の snapshot を返し、current を redo スタックに積む。
 * redo(current) は逆方向。
 *
 * 新しい push をすると redo スタックはクリアされる（典型的な undo 動作）。
 */

export interface HistoryStatus {
  canUndo: boolean;
  canRedo: boolean;
}

type Listener = (s: HistoryStatus) => void;

export class History<T> {
  private _undoStack: T[] = [];
  private _redoStack: T[] = [];
  private _listeners = new Set<Listener>();

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  push(snap: T): void {
    this._undoStack.push(snap);
    this._redoStack.length = 0;
    this._emit();
  }

  undo(current: T): T | null {
    const prev = this._undoStack.pop();
    if (prev === undefined) return null;
    this._redoStack.push(current);
    this._emit();
    return prev;
  }

  redo(current: T): T | null {
    const next = this._redoStack.pop();
    if (next === undefined) return null;
    this._undoStack.push(current);
    this._emit();
    return next;
  }

  clear(): void {
    if (this._undoStack.length === 0 && this._redoStack.length === 0) return;
    this._undoStack.length = 0;
    this._redoStack.length = 0;
    this._emit();
  }

  subscribe(l: Listener): () => void {
    this._listeners.add(l);
    return () => {
      this._listeners.delete(l);
    };
  }

  private _emit(): void {
    const s: HistoryStatus = { canUndo: this.canUndo, canRedo: this.canRedo };
    for (const l of this._listeners) l(s);
  }
}

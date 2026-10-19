/** Keeps only agent-owned creation IDs in undo, and bounds retained redo images. */
export class McpCutoutHistory<T extends { id: string; thumbnailUrl: string }> {
  private undoIds: string[] = [];
  private redoItems: T[] = [];
  constructor(private maxEntries = 100, private maxRedoBytes = 64 * 1024 * 1024) {}
  get canUndo() { return this.undoIds.length > 0; }
  get canRedo() { return this.redoItems.length > 0; }
  record(item: T) { this.undoIds.push(item.id); this.undoIds = this.undoIds.slice(-this.maxEntries); this.redoItems = []; }
  undo(current: T[]) {
    const id = this.undoIds.pop();
    if (!id) throw new Error('No agent cutout is available to undo in this connection.');
    const item = current.find(item => item.id === id);
    if (!item) throw new Error('The cutout was already removed in the editor.');
    this.redoItems.push(item);
    let bytes = this.redoItems.reduce((sum, item) => sum + item.thumbnailUrl.length * 2, 0);
    while (this.redoItems.length > this.maxEntries || bytes > this.maxRedoBytes) { bytes -= this.redoItems.shift()!.thumbnailUrl.length * 2; }
    return item;
  }
  redo() {
    const item = this.redoItems.pop();
    if (!item) throw new Error('No agent cutout is available to redo.');
    this.undoIds.push(item.id);
    return item;
  }
  reset() { this.undoIds = []; this.redoItems = []; }
}

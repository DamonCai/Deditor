/** Immutable CodeMirror states keep undo, bookmarks, folds and selections
 * when an older text editor releases its DOM. Cleared when the tab closes. */

const editorStateCache = new Map<string, unknown>();

export function getEditorStateCache(tabId: string): unknown | undefined {
  return editorStateCache.get(tabId);
}

export function setEditorStateCache(tabId: string, state: unknown): void {
  editorStateCache.set(tabId, state);
}

export function dropEditorStateCache(tabId: string): void {
  editorStateCache.delete(tabId);
}

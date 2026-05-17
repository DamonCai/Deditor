/** Per-tab CodeMirror EditorState JSON cache — survives Editor unmounts so
 *  undo/redo carries across tab switches (or, in the EditorHost-mounted
 *  world, across the rare unmount paths like split-view dismissal).
 *
 *  Lives in its own module so `main.tsx`'s cache-prune subscriber can call
 *  the drop helper without statically importing `components/Editor.tsx` —
 *  which would in turn drag CodeMirror (~450 KB) into the main chunk.
 *  Editor.tsx is now a lazy chunk; this tiny module stays eager. */

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

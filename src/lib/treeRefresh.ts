// Lightweight pub-sub for "this folder may have changed, please re-list"
// notifications — used after create/delete to refresh affected tree nodes.

type Listener = (path?: string) => void;

const listeners = new Set<Listener>();

export function notifyRefresh(path: string): void {
  listeners.forEach((fn) => {
    try {
      fn(path);
    } catch {
      /* swallow */
    }
  });
}

/** Re-list mounted folders after the app regains focus. An omitted path lets
 * each folder refresh once without broadcasting one event per expanded path. */
export function notifyRefreshAll(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* swallow */
    }
  });
}

export function onRefresh(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

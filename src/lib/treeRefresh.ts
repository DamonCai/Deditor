// Lightweight pub-sub for "this folder may have changed, please re-list"
// notifications — used after create/delete to refresh affected tree nodes.

type Listener = (path: string) => void;

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

export function onRefresh(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

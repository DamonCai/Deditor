/** Editors with an in-place text field finish that transaction before save/close.
 * Registrations are per tab: background editors never intercept global keys. */
const flushers = new Map<string, () => void>();
export function registerDocumentFlush(id: string, flush: () => void) {
  flushers.set(id, flush);
  return () => {
    if (flushers.get(id) === flush) flushers.delete(id);
  };
}
export function flushDocument(id: string) {
  flushers.get(id)?.();
}
export function flushDocuments() {
  for (const flush of flushers.values()) flush();
}

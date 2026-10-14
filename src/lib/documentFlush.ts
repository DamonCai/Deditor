/** Multiple projections may share a document. Only the focused projection
 * flushes, but every registration must survive another projection unmounting. */
const flushers = new Map<string, Set<() => void>>();
export function registerDocumentFlush(id: string, flush: () => void) {
  const group = flushers.get(id) ?? new Set<() => void>();
  group.add(flush); flushers.set(id, group);
  return () => { group.delete(flush); if (!group.size) flushers.delete(id); };
}
export function flushDocument(id: string) { for (const flush of flushers.get(id) ?? []) flush(); }
export function flushDocuments() { for (const id of flushers.keys()) flushDocument(id); }

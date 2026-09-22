/** UI and deferred-edit gate after the final recovery snapshot is committed. */
const closeCommitOwners = new Set<symbol>();
let frozenRoot: HTMLElement | null = null;
let previousInert = false;
export const isWindowCloseCommitted = (): boolean => closeCommitOwners.size > 0;
export function commitWindowClose(): () => void {
  const owner = Symbol();
  if (!closeCommitOwners.size) {
    frozenRoot = document.getElementById("root") ?? document.body;
    previousInert = frozenRoot.inert;
    frozenRoot.inert = true;
  }
  closeCommitOwners.add(owner);
  return () => {
    if (!closeCommitOwners.delete(owner) || closeCommitOwners.size) return;
    if (frozenRoot) frozenRoot.inert = previousInert;
    frozenRoot = null;
  };
}

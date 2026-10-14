import { useEffect, useState } from "react";

export const RETAINED_TAB_LIMIT = 8;
export function retainRecentTabs(
  previous: string[],
  activeId: string | null,
  live: string[],
): string[] {
  const alive = new Set(live);
  const next = previous.filter((id) => alive.has(id) && id !== activeId);
  if (activeId && alive.has(activeId)) next.push(activeId);
  return next.slice(-RETAINED_TAB_LIMIT);
}

export function useRetainedTabs(activeId: string | null, live: string[]) {
  const [recent, setRecent] = useState(() =>
    retainRecentTabs([], activeId, live),
  );
  useEffect(() => {
    setRecent((old) => {
      const next = retainRecentTabs(old, activeId, live);
      return next.length === old.length && next.every((id, i) => id === old[i])
        ? old
        : next;
    });
  }, [activeId, live]);
  return recent;
}

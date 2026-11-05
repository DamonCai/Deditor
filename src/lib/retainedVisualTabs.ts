import { RETAINED_TAB_LIMIT } from "./retainedTabs";

const MiB = 1024 * 1024;
export const VISUAL_OVERFLOW_BYTES = 768 * MiB;
export const VISUAL_OVERFLOW_IDLE_MS = 120_000;
export const VISUAL_OVERFLOW_LIMIT = 12;
export type VisualVisit = { id: string; usedAt: number; extra?: true };

/** Budget estimates for the extra live WebKit views. Native allocator and
 * shared process overhead are not observable through WebKit's JS APIs. */
export function visualViewCost(sourceLength: number, elements: number, decodedImageBytes: number) {
  return 16 * MiB + Math.max(sourceLength * 256, elements * 4096) + decodedImageBytes;
}

export function retainVisualTabs(
  previous: readonly VisualVisit[], active: string | null, live: readonly string[],
  costs: ReadonlyMap<string, number>, now: number, panes: number, extended: boolean,
): VisualVisit[] {
  const eligible = new Set(live);
  const next = previous.filter(item => item.id !== active && eligible.has(item.id));
  if (active && eligible.has(active)) next.push({ id: active, usedAt: now });
  const base = next.filter(item => !item.extra).slice(-RETAINED_TAB_LIMIT);
  if (!extended) return base;
  const baseIds = new Set(base.map(item => item.id));
  let budget = VISUAL_OVERFLOW_BYTES / panes;
  let count = Math.floor(VISUAL_OVERFLOW_LIMIT / panes);
  const overflow: VisualVisit[] = [];
  for (let i = next.length - 1; i >= 0 && count > 0; --i) {
    const item = next[i];
    if (baseIds.has(item.id)) continue;
    const cost = costs.get(item.id);
    if (now - item.usedAt >= VISUAL_OVERFLOW_IDLE_MS || cost === undefined || cost > budget) continue;
    overflow.unshift(item.extra ? item : { ...item, extra: true });
    budget -= cost;
    --count;
  }
  return [...overflow, ...base];
}

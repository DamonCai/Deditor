import type { SourceNode } from "./document";

// Source trees are immutable after indexing. A keystroke shifts every following
// block, but history should share their unchanged descendants instead of keeping
// a deep copy of the whole document per undo group.
const shifted = new WeakMap<SourceNode, { base: SourceNode; offset: number }>();
export function offsetSourceTree(node: SourceNode, offset: number): SourceNode {
  if (!offset) return node;
  const previous = shifted.get(node);
  const base = previous?.base ?? node;
  const amount = (previous?.offset ?? 0) + offset;
  if (!amount) return base;
  let children: SourceNode[] | undefined;
  const result: SourceNode = {
    ...base,
    position: base.position ? {
      start: { offset: (base.position.start.offset ?? 0) + amount },
      end: { offset: (base.position.end.offset ?? 0) + amount },
    } : undefined,
    get children() {
      return children ??= base.children?.map(child => offsetSourceTree(child, amount));
    },
  };
  // Flatten successive shifts to the original tree; never retain a chain of
  // prior keystrokes or recursively resolve it when a distant block is visited.
  shifted.set(result, { base, offset: amount });
  return result;
}

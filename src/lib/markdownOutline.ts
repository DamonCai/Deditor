/** Preview's gradual end-of-document threshold, shared by both outline hosts. */
export function outlineActiveIndex(offsets: number[], top: number, height: number, scrollHeight: number) {
  if (!offsets.length) return -1;
  const max = Math.max(0, scrollHeight - height);
  const start = Math.max(0, offsets[offsets.length - 1] - height);
  const progress = max <= start || top < start ? 0 : Math.max(0, Math.min(1, (top - start) / (max - start)));
  const threshold = top + 80 + progress * (height - 80);
  let index = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= threshold) index = i;
    else break;
  }
  return index;
}

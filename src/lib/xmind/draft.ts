import type { Box, Measure, SceneNode } from "./scene";

/** Editing geometry is independent of the persisted topic and font size. */
export function draftBox(node: SceneNode, draft: string, viewport: Box, zoom: number, measure: Measure, singleLine = false) {
  const padding = 4 / zoom, margin = 12 / zoom;
  const inset = padding * 2 + 2; // Include both 1-unit textarea borders.
  const fontSize = Math.max(node.fontSize, 12 / zoom);
  const maxWidth = Math.max(1, viewport.width - margin * 2);
  const maxHeight = Math.max(1, viewport.height - 76 / zoom);
  const lines = draft.split("\n");
  const width = Math.min(maxWidth, Math.max(node.content.width,
    Math.min(480 / Math.min(1, zoom), Math.max(80 / Math.min(1, zoom),
      ...lines.map(line => measure(line, fontSize, node.properties) + inset + 1 / zoom)))));
  const rows = singleLine ? 1 : lines.reduce((count, line) => count + Math.max(1,
    Math.ceil(measure(line, fontSize, node.properties) / Math.max(1, width - inset))), 0);
  const height = Math.min(maxHeight, rows * fontSize * 1.4 + inset);
  const left = viewport.x + margin, top = viewport.y + margin;
  const x = Math.max(left, Math.min(node.x + (node.width - width) / 2, left + maxWidth - width));
  const y = Math.max(top, Math.min(node.y + node.content.y + (node.imageHeight ? node.imageHeight + 8 : 0) - padding,
    top + maxHeight - height));
  return { x: x - node.x, y: y - node.y, width, height, fontSize, padding };
}

import type { Sheet, Topic, Relationship } from '../../src/lib/xmind/document';
import { ARROW_SHAPES } from '../../src/lib/xmind/arrows';

/** Self-created paired arrows, opposite directions and three connection widths. */
export function arrowCatalogSheets(): Sheet[] {
  return [1, 2, 4].map(width => {
    const prefix = `arrows-${width}`;
    const topics: Topic[] = [], relationships: Relationship[] = [];
    ARROW_SHAPES.forEach((shape, index) => {
      const col = index % 2, row = Math.floor(index / 2);
      const ids = [`${prefix}-${shape}-a`, `${prefix}-${shape}-b`];
      for (let end = 0; end < 2; end++) topics.push({
        id: ids[end], title: end ? '终点' : shape,
        position: { x: col * 650 + end * 360, y: 150 + row * 140 },
        style: { properties: { 'svg:fill': '#F1F5F9', 'fo:color': '#243B53', 'fo:font-size': '16', 'border-line-color': '#94A3B8' } },
      });
      relationships.push({ id: `${prefix}-${shape}`, end1Id: ids[index % 2], end2Id: ids[1-index % 2],
        title: shape, style: { properties: { 'shape-class': 'org.xmind.relationshipShape.straight',
          'line-color': '#243B53', 'line-width': String(width), 'line-pattern': 'solid',
          'arrow-begin-class': `org.xmind.arrowShape.${shape}`, 'arrow-end-class': `org.xmind.arrowShape.${shape}`,
          'fo:color': '#243B53', 'fo:font-size': '14' } }, customArrowProbe: { width, shape } });
    });
    return { id: prefix, title: `${width}pt 箭头对照`,
      rootTopic: { id: `${prefix}-root`, title: `${width}pt 起终点箭头`, children: { detached: topics } }, relationships };
  });
}

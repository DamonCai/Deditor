import type { Sheet, Topic } from '../../src/lib/xmind/document';

/** Synthetic smart-theme cases; never sourced from personal workbooks. */
export function smartColorSheets(): Sheet[] {
  return ['#FFFFFF', '#112244'].map((background, index) => {
    const prefix = `smart-${index}`;
    const cases: [string, Record<string, string>][] = [
      ['中灰优先白字', { 'svg:fill': '#777777' }],
      ['浅色采用色板', { 'svg:fill': '#FFF4CC' }],
      ['透明色混合背景', { 'svg:fill': '#00000020' }],
      ['不填充采用背景', { 'fill-pattern': 'none' }],
      ['显式文字覆盖', { 'svg:fill': '#FFF4CC', 'fo:color': '#9A2250' }],
      ['深色采用白字', { 'svg:fill': '#112244' }],
    ];
    const topics: Topic[] = cases.map(([title, properties], i) => ({
      id: `${prefix}-${i}`, title,
      position: { x: 280 + i % 2 * 390, y: 150 + Math.floor(i / 2) * 160 },
      style: { properties: { ...properties, 'fo:font-size': '20pt' } },
      ...(i === 0 ? { boundaries: [{ id: `${prefix}-boundary`, range: 'master', title: '色板边界文字' }] } : {}),
    }));
    return {
      id: prefix, title: index ? '深色智能文字' : '浅色智能文字',
      theme: {
        map: { properties: { 'svg:fill': background, 'color-list': '#FFF4CC #243B53' } },
        centralTopic: { properties: { 'svg:fill': '#0055CC', 'fill-pattern': 'none', 'fo:color': 'inherited' } },
        floatingTopic: { properties: { 'svg:fill': '#FFF4CC', 'fo:color': 'inherited' } },
        relationship: { properties: { 'fo:color': 'inherited', 'line-color': '#8192A3', 'shape-class': 'org.xmind.relationshipShape.straight' } },
        boundary: { properties: { 'fo:color': 'inherited', 'line-color': '#FFF4CC', 'svg:fill': '#8192A3', 'svg:opacity': '0.2' } },
      },
      rootTopic: { id: `${prefix}-root`, title: '智能主题文字', children: { detached: topics } },
      relationships: [{ id: `${prefix}-relation`, end1Id: `${prefix}-2`, end2Id: `${prefix}-3`, title: '背景文字颜色' }],
    };
  });
}

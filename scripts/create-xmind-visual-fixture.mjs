// Synthetic local-only workbook for native XMind / DEditor visual comparison.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

const out = fileURLToPath(new URL('../tests/artifacts/xmind-native-review/', import.meta.url));
mkdirSync(out, { recursive: true });
let sequence = 0;
const id = () => `visual20260909${String(++sequence).padStart(10, '0')}`;
const style = properties => ({ id: id(), properties });
const topic = (title, children = [], extra = {}) => ({
  id: id(), class: 'topic', title,
  ...(children.length ? { children: { attached: children } } : {}), ...extra,
});
const palette = ['#2563EB', '#0D9488', '#D97706', '#9333EA', '#DB2777', '#475569'];
const theme = () => ({
  map: style({ 'svg:fill': '#F8FAFC', 'multi-line-colors': palette.join(' '), 'line-tapered': 'none' }),
  centralTopic: style({ 'svg:fill': '#172554', 'fo:color': '#FFFFFF', 'fo:font-size': '28pt', 'fo:font-family': 'NeverMind', 'fo:font-weight': '600', 'shape-class': 'org.xmind.topicShape.roundedRect', 'line-width': '3pt', 'line-class': 'org.xmind.branchConnection.curve' }),
  mainTopic: style({ 'svg:fill': '#E2E8F0', 'fo:color': '#172554', 'fo:font-size': '19pt', 'fo:font-weight': '600', 'shape-class': 'org.xmind.topicShape.roundedRect', 'line-class': 'org.xmind.branchConnection.roundedElbow', 'line-width': '2pt' }),
  subTopic: style({ 'svg:fill': '#FFFFFF', 'fo:color': '#334155', 'fo:font-size': '14pt', 'shape-class': 'org.xmind.topicShape.underline', 'line-width': '1pt' }),
  floatingTopic: style({ 'svg:fill': '#FEF3C7', 'fo:color': '#92400E', 'fo:font-size': '16pt', 'shape-class': 'org.xmind.topicShape.roundedRect' }),
  calloutTopic: style({ 'svg:fill': '#FFE4E6', 'fo:color': '#9F1239', 'fo:font-size': '13pt', 'shape-class': 'org.xmind.topicShape.roundedRect' }),
  summaryTopic: style({ 'svg:fill': '#EDE9FE', 'fo:color': '#5B21B6', 'fo:font-size': '14pt', 'shape-class': 'org.xmind.topicShape.roundedRect' }),
});
const branch = (title, index, children) => topic(title, children, {
  style: style({ 'svg:fill': palette[index], 'fo:color': '#FFFFFF', 'line-color': palette[index], 'border-line-color': palette[index] }),
});
const shape = (name, fill) => style({ 'shape-class': `org.xmind.topicShape.${name}`, 'svg:fill': fill, 'border-line-width': '2pt', 'border-line-color': '#64748B' });
const design = branch('01 视觉语言 / Design', 0, [
  topic('色彩系统', [topic('Primary · 深蓝 #172554'), topic('Accent · 湖蓝与紫罗兰'), topic('高对比度 / 浅色画布')]),
  topic('字体与排版', [topic('中文 English 日本語 😀'), topic('多行标题\n第二行：说明与换行'), topic('强调 Bold + Italic', [], { style: style({ 'fo:font-weight': 'bold', 'fo:font-style': 'italic', 'fo:color': '#BE185D', 'fo:font-size': '18pt' }) })]),
  topic('内嵌 PNG / DEditor', [], { image: { src: 'xap:resources/deditor.png', width: 96, height: 96 } }),
]);
design.boundaries = [{ id: id(), range: '(0,1)', title: '基础设计规范', style: style({ 'svg:fill': '#DBEAFE', 'line-color': '#60A5FA', 'line-pattern': 'dash', 'shape-class': 'org.xmind.boundaryShape.roundedRect' }) }];
const delivery = branch('02 交付计划 / Delivery', 1, [
  topic('M1 · 方案确认', [], { markers: [{ markerId: 'priority-1' }, { markerId: 'task-done' }], labels: ['P0', '已完成'] }),
  topic('M2 · 开发迭代', [topic('文档模型'), topic('原生渲染'), topic('编辑与保存')], { markers: [{ markerId: 'task-half' }], labels: ['进行中'] }),
  topic('M3 · 视觉验收', [topic('XMind 原生窗口'), topic('DEditor 原生窗口')], { notes: { plain: { content: '合成验收数据。重点比较布局、图标、边界、概要和图片。此备注不包含任何真实业务信息。' } } }),
]);
delivery.children.summary = [topic('里程碑闭环')];
delivery.summaries = [{ id: id(), range: '(0,2)', topicId: delivery.children.summary[0].id }];
const shapes = branch('03 形状实验 / Shapes', 2, [
  topic('圆角矩形', [], { style: shape('roundedRect', '#FEF3C7') }),
  topic('椭圆 / Ellipse', [], { style: shape('ellipse', '#FFEDD5') }),
  topic('菱形 / Decision', [], { style: shape('diamond', '#FEE2E2') }),
  topic('矩形 / Rectangle', [], { style: shape('rect', '#DCFCE7') }),
]);
const quality = branch('04 质量保障 / Quality', 3, [
  topic('可读性', [topic('长标题自动换行：在不同窗口尺寸下检查中文、英文和连续字符的布局是否稳定'), topic('备注与标签', [], { labels: ['visual-QA', '跨平台'], notes: { plain: { content: '检查标签是否完整展示；图标是否与原生一致。' } } })]),
  topic('交互', [topic('切换四个工作表'), topic('缩放 / 适合窗口'), topic('折叠与展开')]),
]);
quality.children.callout = [topic('批注：关注边界与主题间距')];
const arch = branch('05 架构 / Architecture', 4, [
  topic('Frontend', [topic('React → SVG Scene'), topic('Theme / Layout / Camera')]),
  topic('Native', [topic('Tauri → Rust IPC'), topic('ZIP → content.json')]),
  topic('文档说明链接', [], { href: 'https://example.com/', labels: ['示例链接'] }),
]);
const deep = branch('06 深层结构 / Depth', 5, [
  topic('Level 2', [topic('Level 3', [topic('Level 4', [topic('Level 5 · 叶节点', [], { markers: [{ markerId: 'star-red' }] })])])]),
  topic('并行分支 A', [topic('条目 A.1'), topic('条目 A.2')]),
  topic('并行分支 B', [topic('条目 B.1'), topic('条目 B.2')]),
]);
const root = topic('复杂样式兼容性验收\nDEditor × XMind', [design, delivery, shapes, quality, arch, deep], {
  structureClass: 'org.xmind.ui.map.unbalanced',
  extensions: [{ provider: 'org.xmind.ui.map.unbalanced', content: [{ name: 'right-number', content: '3' }] }],
});
root.children.detached = [topic('自由主题 / Floating\n坐标与独立子树', [topic('独立信息卡片')], { position: { x: -420, y: 900 } })];
const sheet = (title, rootTopic) => ({ id: id(), class: 'sheet', title, rootTopic, theme: theme() });
const main = sheet('01 综合样式', root);
main.relationships = [{ id: id(), end1Id: design.id, end2Id: delivery.id, title: '设计驱动交付', style: style({ 'line-color': '#E11D48', 'line-width': '2pt', 'line-pattern': 'dash', 'arrow-end-class': 'org.xmind.arrowShape.triangle' }) }];
const org = sheet('02 组织结构', topic('产品研发中心', [
  branch('产品与设计', 0, [topic('产品规划', [topic('需求调研'), topic('路线图')]), topic('体验设计', [topic('交互设计'), topic('视觉规范')])]),
  branch('工程研发', 1, [topic('客户端', [topic('macOS / WKWebView'), topic('Windows / WebView2')]), topic('文档引擎', [topic('解析与无损保存'), topic('布局与渲染')])]),
  branch('质量与发布', 3, [topic('质量保障', [topic('自动化回归'), topic('原生视觉比对')]), topic('发布管理', [topic('安装包'), topic('版本记录')])]),
], { structureClass: 'org.xmind.ui.org-chart.down' }));
const timeline = sheet('03 时间轴', topic('2026 · 版本演进', [
  branch('Q1 · 发现', 0, [topic('用户访谈'), topic('需求梳理'), topic('交互原型')]),
  branch('Q2 · 构建', 1, [topic('文档模型'), topic('原生编辑器'), topic('主题系统')]),
  branch('Q3 · 验证', 2, [topic('复杂样式'), topic('跨软件往返'), topic('性能采样')]),
  branch('Q4 · 交付', 3, [topic('修复差异'), topic('安装包验收'), topic('正式发布')]),
], { structureClass: 'org.xmind.ui.timeline.horizontal' }));
const fishbone = sheet('04 鱼骨分析', topic('显示效果差异', [
  branch('字体', 0, [topic('字体回退'), topic('字重与行高'), topic('中英文测量')]),
  branch('布局', 1, [topic('子树间距'), topic('边界包围'), topic('概要占位')]),
  branch('样式', 2, [topic('形状'), topic('联系控制点'), topic('图标与标签')]),
  branch('平台', 3, [topic('缩放比例'), topic('WebView 渲染'), topic('资源加载')]),
], { structureClass: 'org.xmind.ui.fishbone.leftHeaded' }));
const sheets = [main, org, timeline, fishbone];
const files = {
  'content.json': strToU8(JSON.stringify(sheets)),
  'metadata.json': strToU8(JSON.stringify({ creator: { name: 'DEditor visual fixture', version: '1.0' }, activeSheetId: main.id })),
  'resources/deditor.png': new Uint8Array(readFileSync(new URL('../src-tauri/icons/128x128.png', import.meta.url))),
};
files['manifest.json'] = strToU8(JSON.stringify({ 'file-entries': Object.fromEntries(Object.keys(files).map(k => [k, {}])) }));
const path = `${out}complex-styles-verified.xmind`;
writeFileSync(path, zipSync(files));
const count = t => 1 + Object.values(t.children ?? {}).flat().reduce((n, c) => n + count(c), 0);
writeFileSync(`${out}fixture-inventory.json`, JSON.stringify(sheets.map(s => ({ sheet: s.title, structure: s.rootTopic.structureClass, topics: count(s.rootTopic) })), null, 2));
console.log(path);
console.log(sheets.map(s => `${s.title}: ${count(s.rootTopic)} topics`).join('\n'));

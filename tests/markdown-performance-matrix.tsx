// Self-generated fixtures only. Production hosts, cache limits and history; no app persistence.
import React, { Profiler, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import EditorPane from '../src/components/EditorPane';
import DiffView from '../src/components/DiffView';
import { useEditorStore } from '../src/store/editor';
import { getActiveView, getActiveViewTabId } from '../src/lib/editorBridge';
import { getVisualEditor } from '../src/lib/markdownVisualBridge';
import { markdownHistory } from '../src/lib/markdownHistory';
import { flushDocument } from '../src/lib/documentFlush';
import { MarkdownPreviewDocument } from '../src/lib/markdownPreviewDocument';
import '../src/styles.css';

const params = new URLSearchParams(location.search);
const kind = params.get('fixture') || '100k';
const initialMode = params.get('mode') === 'visual' ? 'visual' : params.get('mode') === 'split' ? 'split' : 'source';
function fixture() {
  if (kind === 'fences') return '# Code fence matrix\n\n' + Array.from({ length: 300 }, (_, i) => `## Fence ${i}\n\nAnchor ${i} editable paragraph.\n\n\`\`\`typescript\nconst value${i} = ${i};\nconsole.log(value${i});\n\`\`\`\n\n`).join('') + 'MATRIX_END\n';
  const bytes = kind === '1m' ? 1_048_576 : 102_400;
  let value = '# Matrix document\n\n';
  for (let i = 0; value.length < bytes; i++) value += `## Section ${i}\n\nAnchor ${i} editable paragraph ${'ordinary prose with **bold** and *emphasis*; '.repeat(8)}\n\n`;
  return value + 'MATRIX_END\n';
}
const original = fixture();
const originals = new Map(Array.from({ length: 10 }, (_, i) => [`matrix-${i}`, i ? `# Companion ${i}\n\nIndependent history ${i}.\n` : original]));
const tabs = [...originals].map(([id, content]) => ({ id, filePath: `/generated/${id}.md`, content, savedContent: content }));
Object.defineProperty(window, '__TAURI_INTERNALS__', { value: { convertFileSrc: (path: string) => new URL(path, location.origin).href }, configurable: true });
useEditorStore.setState({ tabs, activeId: tabs[0].id, markdownMode: initialMode, language: 'en', theme: 'light' });
type Sample = { event: string; ms: number; trusted?: boolean; commits: number; reactMs: number; detail?: unknown };
const samples: Sample[] = [];
let commits = 0, reactMs = 0;
let lastInput = 0;
useEditorStore.subscribe((next, previous) => { if (next.markdownMode !== previous.markdownMode || next.activeId !== previous.activeId) lastInput = 0; });
const previewThemes = new WeakMap<Element, string>();
const updatePreview = MarkdownPreviewDocument.prototype.update;
MarkdownPreviewDocument.prototype.update = function (...args: Parameters<typeof updatePreview>) {
  const result = updatePreview.apply(this, args);
  for (const el of document.querySelectorAll('.preview')) if (el.getClientRects().length) previewThemes.set(el, args[1].theme);
  if (lastInput) { const started = lastInput; lastInput = 0; void settle().then(() => samples.push({ event: 'preview-after-last-input', ms: performance.now() - started, commits: 0, reactMs: 0 })); }
  return result;
};
const profile = (_id: string, _phase: string, duration: number) => { commits++; reactMs += duration; };
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function settle() { await frame(); await frame(); }
async function ready() {
  const start = performance.now();
  while (performance.now() - start < 120_000) {
    const state = useEditorStore.getState(), id = state.activeId;
    const bridge = state.markdownMode === 'visual' ? getVisualEditor()?.tabId === id : getActiveViewTabId() === id;
    const preview = state.markdownMode !== 'split' || [...document.querySelectorAll('.preview')].some(el => el.getClientRects().length && previewThemes.get(el) === state.theme && el.textContent?.includes(id === 'matrix-0' ? 'MATRIX_END' : 'Independent history'));
    if (bridge && preview) { await settle(); return; }
    await frame();
  }
  throw new Error('Editor or full preview did not become ready');
}
async function measure(event: string, action: () => void | Promise<unknown>, detail?: unknown) {
  const start = performance.now(), c = commits, r = reactMs;
  await action(); await settle();
  samples.push({ event, ms: performance.now() - start, commits: commits - c, reactMs: reactMs - r, detail });
}
document.addEventListener('beforeinput', event => {
  if (!(event.target as HTMLElement)?.closest('.editor-group')) return;
  const start = performance.now(), c = commits, r = reactMs; lastInput = useEditorStore.getState().markdownMode === 'split' ? start : 0;
  // Each input owns its closure; no last-event coalescing and no React output during typing.
  void settle().then(() => samples.push({ event: `input-two-frames:${event.inputType}`, trusted: event.isTrusted, ms: performance.now() - start, commits: commits - c, reactMs: reactMs - r }));
}, true);
document.addEventListener('click', event => {
  if (!(event.target as HTMLElement)?.closest('.diff-view button')) return;
  const label = (event.target as HTMLElement).closest('button')?.getAttribute('title') || (event.target as HTMLElement).textContent || 'diff';
  void measure(`diff:${label}`, () => {});
}, true);
const boot = performance.now();
function Matrix() {
  const [output, setOutput] = useState('Starting');
  const [history, setHistory] = useState<{ count: number; dense: boolean } | null>(null);
  const spec = React.useMemo(() => {
    if (!history) return null;
    const lines = Array.from({ length: history.count }, (_, i) => `Line ${i}: original text and stable context.`);
    return { leftPath: 'before.md', rightPath: 'after.md', leftContent: lines.join('\n'), rightContent: lines.map((line, i) => i % (history.dense ? 3 : 100) === 0 ? `${line} modified` : line).join('\n') };
  }, [history]);
  React.useEffect(() => { void ready().then(() => { samples.push({ event: 'mount-ready-after-imports', ms: performance.now() - boot, commits, reactMs }); setOutput('Ready'); }); }, []);
  async function run(action: () => Promise<unknown>) { try { await action(); } catch (error) { setOutput(String(error)); } }
  function goto(where: number) {
    const tab = useEditorStore.getState().tabs.find(t => t.id === useEditorStore.getState().activeId)!;
    const anchors = [...tab.content.matchAll(/^Anchor .*$/gm)];
    const target = anchors[Math.floor((anchors.length - 1) * where)];
    const offset = (target?.index || 0) + (target?.[0].length || 0);
    if (useEditorStore.getState().markdownMode === 'visual') {
      const before = tab.content.slice(0, offset).split('\n');
      getVisualEditor()?.navigate?.(before.length, before.at(-1)!.length + 1, { center: true });
      getVisualEditor()?.focus();
    } else {
      const view = getActiveView();
      view?.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'center' }) }); view?.focus();
    }
  }
  function check() {
    const id = useEditorStore.getState().activeId!; flushDocument(id);
    const tab = useEditorStore.getState().tabs.find(t => t.id === id)!;
    setOutput(JSON.stringify({ id, bytes: new TextEncoder().encode(tab.content).length, equal: tab.content === originals.get(id), inserts: (tab.content.match(/qwertyuiopasdfghjklzxcvbnm1234/g) || []).length, sourceViews: document.querySelectorAll('.cm-editor').length, visualViews: document.querySelectorAll('.ProseMirror').length, selection: getActiveView()?.state.selection.main.toJSON(), scroll: getActiveView()?.scrollDOM.scrollTop, samples }, null, 2));
  }
  function viewport() {
    const view = getActiveView(); if (!view) return null;
    const rect = view.scrollDOM.getBoundingClientRect(), caret = view.coordsAtPos(view.state.selection.main.head);
    const block = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
    return { firstLine: view.state.doc.lineAt(block.from).number, caretTop: caret ? caret.top - rect.top : null, viewportHeight: rect.height };
  }
  async function cycle() {
    flushDocument('matrix-0'); const before = useEditorStore.getState().tabs.map(t => t.content);
    const viewportBefore = viewport(); const position = getActiveView()?.state.selection.main.toJSON(); const scroll = getActiveView()?.scrollDOM.scrollTop;
    for (let i = 1; i < 10; i++) await measure(`tab:${i}`, async () => { useEditorStore.getState().setActive(`matrix-${i}`); await ready(); });
    await measure('tab:cold-restore', async () => { useEditorStore.getState().setActive('matrix-0'); await ready(); });
    const after = useEditorStore.getState().tabs.map(t => t.content);
    samples.push({ event: 'tab-integrity', ms: 0, commits: 0, reactMs: 0, detail: { content: JSON.stringify(before) === JSON.stringify(after), viewportBefore, viewportAfter: viewport(), positionBefore: position, positionAfter: getActiveView()?.state.selection.main.toJSON(), scrollBefore: scroll, scrollAfter: getActiveView()?.scrollDOM.scrollTop } });
  }
  return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 6, fontSize: 12 }}>
      <b>{kind} / {new TextEncoder().encode(original).length} bytes</b>
      {(['source', 'split', 'visual'] as const).map(mode => <button key={mode} onClick={() => void run(() => measure(`mode:${mode}`, async () => { useEditorStore.setState({ markdownMode: mode }); await ready(); }))}>{mode}</button>)}
      {['Head', 'Middle', 'Tail'].map((label, i) => <button key={label} onClick={() => goto(i / 2)}>{label}</button>)}
      <button onClick={() => { const view = getActiveView(); if (!view) return; const offset = view.state.doc.toString().indexOf('const value150') + 6; if (offset < 6) return; view.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'center' }) }); view.focus(); }}>Code midpoint</button>
      <button onClick={() => void run(cycle)}>Cycle 10 tabs</button>
      <button onClick={() => void run(() => measure('theme', async () => { const theme = useEditorStore.getState().theme === 'dark' ? 'light' : 'dark'; document.documentElement.classList.toggle('dark', theme === 'dark'); useEditorStore.getState().setTheme(theme); await ready(); }))}>Theme</button>
      <button onClick={() => void run(async () => { const id = useEditorStore.getState().activeId!; for (let i = 0; i < 100; i++) { flushDocument(id); const before = useEditorStore.getState().tabs.find(t => t.id === id)!.content; if (before === originals.get(id)) break; markdownHistory(false, id); await settle(); if (useEditorStore.getState().tabs.find(t => t.id === id)!.content === before) break; } await check(); })}>Undo to original</button>
      {[1000, 10000].flatMap(count => [false, true].map(dense => <button key={`${count}-${dense}`} onClick={() => void run(() => measure(`history:${count}:${dense}`, () => setHistory({ count, dense })))}>{count} {dense ? 'dense' : 'sparse'}</button>))}
      <button onClick={() => setHistory(null)}>Editor</button><button onClick={() => void check()}>Read results</button><button onClick={() => { samples.length = 0; setOutput('Cleared'); }}>Clear samples</button>
    </div>
    <details><summary>Results</summary><pre data-testid="matrix-results" data-equal={output.startsWith('{') ? String(JSON.parse(output).equal) : undefined} style={{ maxHeight: 200, overflow: 'auto', fontSize: 11 }}>{output}</pre></details>
    <Profiler id="matrix" onRender={profile}>{spec ? <div style={{ flex: 1, minHeight: 0 }}><DiffView spec={spec} navigation /></div> : <EditorPane />}</Profiler>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Matrix />);

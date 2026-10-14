// Generated documents only. No app restoration, filesystem reads or writes.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Editor from '../src/components/Editor';
import { getActiveView } from '../src/lib/editorBridge';
import { toggleBookmarkEffect, clearBookmarks } from '../src/lib/bookmarks';
import { useEditorStore } from '../src/store/editor';
import '../src/styles.css';

(window as any).__TAURI_INTERNALS__ = { invoke: async () => null };
const params = new URLSearchParams(location.search);
const count = Number(params.get('rows') ?? 3000);
const source = JSON.stringify(Array.from({ length: count }, (_, id) => ({ id, name: `自建 JSON 行 ${id}`, color: '#336699', enabled: true })), null, 2);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
document.documentElement.classList.toggle('dark', theme === 'dark');
useEditorStore.setState({ tabs: [], activeId: null, theme, autoSave: 'off', softWrap: false });
function Review() {
  const [value, setValue] = React.useState(source);
  const [line, setLine] = React.useState(1);
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', width: params.has('narrow') ? 720 : '100%' }}>
    <header style={{ height: 70, flexShrink: 0 }}>
      <div>Generated JSON: {source.length} characters; {source.split('\n').length} lines</div>
      <button onClick={() => { const view = getActiveView()!; view.dispatch({ effects: toggleBookmarkEffect.of({ from: view.state.doc.line(Math.max(1, Math.floor(view.state.doc.lines / 2))).from }) }); }}>Toggle middle bookmark</button>{' '}
      <button onClick={() => clearBookmarks(getActiveView()!)}>Clear bookmarks</button>{' '}
      <output>Top line: {Math.round(line)}; unchanged: {String(value === source)}</output>
    </header>
    <div style={{ flex: 1, minHeight: 0 }}><Editor value={value} filePath="/generated/scroll.json" theme={theme} fontSize={14} noStateCache onChange={setValue} onScroll={setLine} /></div>
  </main>;
}
const root = createRoot(document.getElementById('root')!);
root.render(<Review />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

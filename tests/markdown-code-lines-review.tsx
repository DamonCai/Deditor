// Self-created fixture. Commands are displayed as text and never executed.
import React from 'react';
import { createRoot } from 'react-dom/client';
import EditorSlot from '../src/components/EditorSlot';
import Preview from '../src/components/Preview';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';

const initial = '# 代码块行数核对\n\n```bash\necho first\necho second\necho third\n\n\n```\n\n末尾正文。\n';
useEditorStore.setState({ tabs: [{ id: 'code-lines', filePath: '/generated/code-lines.md', content: initial, savedContent: initial }], activeId: 'code-lines', markdownMode: 'split', theme: 'light', language: 'zh', autoSave: 'off', markdownSettings: { ...useEditorStore.getState().markdownSettings, codeLineNumbers: true } });
function Review() {
  const [mode, setMode] = React.useState(false);
  const [result, setResult] = React.useState('');
  const theme = useEditorStore(s => s.theme);
  const check = () => {
    const count = (selector: string) => document.querySelectorAll(selector).length;
    const content = useEditorStore.getState().tabs[0].content;
    setResult(JSON.stringify({ previewLines: count('[data-host="preview"] code > .line'), visualLines: count('[data-host="editor"] code > .line'), codeEditorLines: count('.md-code-editor .cm-lineNumbers .cm-gutterElement') - 1, originalUnchanged: content === initial, source: content }));
  };
  return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
    <div><button onClick={() => { setMode(!mode); useEditorStore.setState({ markdownMode: mode ? 'split' : 'visual' }); }}>{mode ? '显示源码' : '显示阅读编辑'}</button> <button onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; useEditorStore.setState({ theme: next }); document.documentElement.classList.toggle('dark', next === 'dark'); }}>切换主题</button> <button onClick={check}>核对行数和原文</button> <button onClick={() => markdownHistory()}>撤销</button></div>
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div data-host="editor" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>{mode ? <Visual tabId="code-lines" theme={theme}/> : <EditorSlot tabId="code-lines" theme={theme} active fontSize={15}/>}</div>
      <div data-host="preview" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}><Preview tabId="code-lines" theme={theme}/></div>
    </div><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{result}</pre>
  </div>;
}
const root = createRoot(document.getElementById('root')!); root.render(<Review/>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { codePresentation } from '../src/lib/markdownVisual/codePresentation';

let passed = 0;
for (const theme of ['light', 'dark'] as const) {
  for (const language of ['typescript', 'bash', 'unknown-language']) {
    for (const source of ['const bottom = "code";', '\n\tconst value = 1;\n\n']) {
      const extension = await codePresentation(language, theme);
      let state = EditorState.create({ doc: source, extensions: extension });
      const inspect = () => {
        const lines: string[] = [], colors: string[] = [];
        for (const decorations of state.facet(EditorView.decorations)) {
          if (typeof decorations === 'function') continue;
          decorations.between(0, state.doc.length, (_from, _to, value) => {
            if (value.spec.attributes?.['data-code-line']) lines.push(value.spec.attributes['data-code-line']);
            if (value.spec.attributes?.style) colors.push(value.spec.attributes.style);
          });
        }
        assert.deepEqual(lines, Array.from({length:state.doc.lines},(_,i)=>String(i+1)));
        return colors;
      };
      const before = inspect();
      assert.equal(state.doc.toString(), source);
      if (language === 'typescript') assert.ok(before.some(style=>style.includes(theme==='light'?'#D73A49':'#C678DD')));
      // Focus/selection leave the displayed tokens untouched; newlines renumber exact empty lines.
      state = state.update({selection:{anchor:state.doc.length}}).state;
      assert.deepEqual(inspect(), before);
      state = state.update({changes:{from:0,insert:'\n'}}).state;
      inspect(); assert.equal(state.doc.toString(), '\n'+source);
      state = state.update({changes:{from:0,to:1}}).state;
      assert.deepEqual(inspect(), before); assert.equal(state.doc.toString(), source);
      passed++;
    }
  }
}
console.log(`${passed} code focus presentation checks passed`);

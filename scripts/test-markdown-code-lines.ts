import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderMarkdown, renderCode } from '../src/lib/markdown';

const cases = [
  { name: 'reported three commands and two blank lines', source: '```bash\none\ntwo\nthree\n\n\n```\n', body: 'one\ntwo\nthree\n\n' },
  { name: 'single line', source: '```js\nconst a = 1;\n```', body: 'const a = 1;' },
  { name: 'one trailing blank line', source: '```\na\n\n```', body: 'a\n' },
  { name: 'leading and interior blanks', source: '```text\n\na\n\nb\n```', body: '\na\n\nb' },
  { name: 'spaces and tabs are retained', source: '```\na  \n \n\t\n```', body: 'a  \n \n\t' },
  { name: 'empty fence', source: '```\n```', body: '' },
  { name: 'one blank body line', source: '```\n\n```', body: '' },
  { name: 'two blank body lines', source: '```\n\n\n```', body: '\n' },
  { name: 'unknown language', source: '```unknown-deditor-test\na\n\n```', body: 'a\n' },
  { name: 'CRLF', source: '```bash\r\na\r\n\r\n```\r\n', body: 'a\n' },
  { name: 'tilde fence', source: '~~~~bash\na\n\n~~~~', body: 'a\n' },
  { name: 'quoted fence', source: '> ```bash\n> a\n>\n> ```', body: 'a\n' },
  { name: 'list fence', source: '- item\n\n  ```bash\n  a\n\n  ```', body: 'a\n' },
  { name: 'unclosed fence at EOF', source: '```bash\na', body: 'a' },
  { name: 'unclosed fence with trailing blank', source: '```bash\na\n\n', body: 'a\n' },
];
let passed = 0;
for (const theme of ['light', 'dark'] as const) {
  for (const sample of cases) {
    const html = await renderMarkdown(sample.source, { theme });
    const document = new JSDOM(html).window.document;
    const code = document.querySelector('pre.shiki code')!;
    assert.ok(code, sample.name);
    assert.equal(code.textContent, sample.body, `${theme}: ${sample.name}: exact body`);
    assert.equal(code.querySelectorAll(':scope > .line').length, sample.body.split('\n').length, `${theme}: ${sample.name}: line count`);
    passed++;
  }
  // Standalone source files have no closing fence: their final empty line is real.
  const file = new JSDOM(await renderCode('a\n\n', '/generated/sample.sh', { theme })).window.document;
  assert.equal(file.querySelector('code')?.textContent, 'a\n\n');
  assert.equal(file.querySelectorAll('code > .line').length, 3);
  passed++;
}
console.log(`PASS ${passed} Markdown code line cases (exact whitespace, both themes, standalone code isolation)`);

import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderMarkdown, renderCode } from '../src/lib/markdown';
import { normalizeMarkdownFences } from '../src/lib/markdownFence';
import { fittedSvgViewBox } from '../src/lib/htmlBlockHydrate';

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
const tolerantHtmlFences = [
  { name: 'split HTML fence from copied rich text', source: '``` ` ```html\n<main>ok</main>\n```' },
  { name: 'escaped split HTML fence and close', source: '\\``` ` ``\\`html\r\n<main>ok</main>\r\n\\```\r\n' },
];
for (const language of ['p', 'plantuml', 'mermaid', 'html', 'HTML', 'typescript']) {
  for (const eol of ['\n', '\r\n']) {
    const source = '\\`\\`\\`' + language + eol + eol + '| A | B |' + eol + '| --- | --- |' + eol;
    assert.equal(normalizeMarkdownFences(source), source, `${language}: fully escaped ticks stay literal`);
    const document = new JSDOM(await renderMarkdown(source, { theme: 'light' })).window.document;
    assert.ok(document.querySelector('table'), `${language}: literal opener does not consume the table`);
  }
}
const escapedClose = '``` ` ```html\n<main>ok</main>\n\\`\\`\\`\nmore\n```';
assert.ok(normalizeMarkdownFences(escapedClose).includes('\n\\`\\`\\`\nmore\n'), 'literal closing ticks inside code stay literal');
for (const sample of tolerantHtmlFences) {
  const normalized = normalizeMarkdownFences(sample.source);
  assert.equal(normalized.length, sample.source.length, `${sample.name}: source offsets stay stable`);
  assert.equal(normalized.split('\n').length, sample.source.split('\n').length, `${sample.name}: source lines stay stable`);
  const document = new JSDOM(await renderMarkdown(sample.source, { theme: 'light' })).window.document;
  assert.ok(document.querySelector('.html-render-block'), `${sample.name}: copied HTML still renders`);
}
for (const language of ['html', 'HTML', 'Html', 'hTmL']) {
  const source = `\`\`\`${language}\n<SECTION data-case="${language}"><SVG viewBox="0 0 20 10"><RECT width="20" height="10"/></SVG></SECTION>\n\`\`\``;
  const document = new JSDOM(await renderMarkdown(source, { theme: 'light' })).window.document;
  const rendered = document.querySelector('.html-render-block');
  assert.ok(rendered, `${language}: language marker is recognized case-insensitively`);
  assert.equal(document.querySelector('pre.shiki'), null, `${language}: HTML is not rendered as source code`);
  assert.match(rendered.getAttribute('data-html-source') ?? '', new RegExp(`data-case="${language}"`, 'i'),
    `${language}: mixed-case HTML/SVG source reaches the sanitizer placeholder`);
}
assert.deepEqual(
  fittedSvgViewBox(
    { x: 0, y: 0, width: 680, height: 360 },
    { x: 8, y: 176, width: 664, height: 74 },
  ),
  { x: 0, y: 167, width: 680, height: 92 },
  'responsive SVG trims the reported empty vertical canvas only',
);
assert.deepEqual(
  fittedSvgViewBox(
    { x: 0, y: 0, width: 680, height: 360 },
    { x: 8, y: 8, width: 664, height: 344 },
  ),
  { x: 0, y: 0, width: 680, height: 360 },
  'SVG content that fills its canvas keeps the authored viewBox',
);
const previewCss = await import('node:fs/promises').then(fs => fs.readFile(new URL('../src/preview.css', import.meta.url), 'utf8'));
assert.match(previewCss, /\.html-render-block > svg \{[\s\S]*?background-color:\s*#fff;/,
  'fenced SVG keeps transparent modules on a light canvas in dark mode');
for (const variable of ['slate-50', 'indigo-50', 'emerald-50', 'sky-50', 'rose-50', 'amber-50']) {
  assert.match(previewCss, new RegExp(`--${variable}:\\s*#[0-9a-f]{6};`, 'i'),
    `${variable}: portable SVG palette value is available`);
}
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

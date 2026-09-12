import assert from 'node:assert/strict';
import { MarkdownHighlightCache } from '../src/lib/markdownHighlightCache';
import { renderMarkdown } from '../src/lib/markdown';
import { getHighlighter } from '../src/lib/highlight';

const hl = await getHighlighter();
const original = hl.codeToHtml.bind(hl);
const originalLoad = hl.loadLanguage.bind(hl);
let calls = 0;
let failLanguage: string | undefined;
let failAll = false;
hl.codeToHtml = ((code, options) => {
  calls++;
  if (failAll || options.lang === failLanguage) throw new Error('synthetic highlighting failure');
  return original(code, options);
}) as typeof hl.codeToHtml;
const fence = (code: string, lang = 'typescript') => `\`\`\`${lang}\n${code}\n\`\`\``;
const expected = (code: string, lang: string, theme = 'github-light', line = 1) =>
  original(code, { lang, theme }).replace(/^<pre/, `<pre data-line="${line}"`);

try {
  // Round 1: identical code is reused while each document retains its own lines.
  const code = 'const cachedValue: number = 731;';
  assert.equal(await renderMarkdown(fence(code), { theme: 'light' }), expected(code, 'typescript'));
  assert.equal(calls, 1);
  calls = 0;
  const moved = await renderMarkdown('\n\n' + fence(code), { theme: 'light' });
  assert.equal(moved, expected(code, 'typescript', 'github-light', 3));
  assert.equal(calls, 0);
  await renderMarkdown(fence(code) + '\n\n' + fence(code + '\n// changed'), { theme: 'light' });
  assert.equal(calls, 1, 'only changed fence is highlighted');
  console.log('PASS round 1: unchanged/changed fences and moved source lines');

  // Round 2: exact source (including real trailing blank lines) and presentation keys.
  for (const body of ['', '\n', '中文 𝄞é\n\n', 'a\t \n ', '<>&"']) {
    for (const theme of ['light', 'dark'] as const) {
      const html = await renderMarkdown(fence(body, 'text'), { theme });
      assert.equal(html, expected(body, 'text', theme === 'light' ? 'github-light' : 'one-dark-pro'));
      calls = 0;
      assert.equal(await renderMarkdown(fence(body, 'text'), { theme }), html);
      assert.equal(calls, 0);
    }
  }
  const js = await renderMarkdown(fence(code, 'javascript'), { theme: 'light' });
  assert.equal(js, expected(code, 'javascript'));
  assert.equal(await renderMarkdown(fence(code, 'typescript'), { theme: 'dark' }), expected(code, 'typescript', 'one-dark-pro'));
  assert.equal(await renderMarkdown(fence(code, 'unrecognized-cache-test'), { theme: 'light' }), expected(code, 'text'));
  console.log('PASS round 2: empty/Unicode/whitespace, language and theme isolation');

  // Round 3: failed grammar loading may recover; a text result cannot mask it.
  let failLoad = true;
  hl.loadLanguage = (async (...args: Parameters<typeof hl.loadLanguage>) => {
    if (failLoad) { failLoad = false; throw new Error('synthetic grammar loading failure'); }
    return originalLoad(...args);
  }) as typeof hl.loadLanguage;
  const python = 'answer = 9182 # grammar retry';
  assert.equal(await renderMarkdown(fence(python, 'python'), { theme: 'light' }), expected(python, 'text'));
  assert.equal(await renderMarkdown(fence(python, 'python'), { theme: 'light' }), expected(python, 'python'));
  hl.loadLanguage = originalLoad;
  failLanguage = 'typescript';
  const recover = 'const recover: number = 8453;';
  assert.equal(await renderMarkdown(fence(recover), { theme: 'light' }), expected(recover, 'text'));
  failLanguage = undefined;
  calls = 0;
  assert.equal(await renderMarkdown(fence(recover), { theme: 'light' }), expected(recover, 'typescript'));
  assert.equal(calls, 1, 'failed highlight fallback was not cached');
  failAll = true;
  await assert.rejects(renderMarkdown(fence('const failure = 9283;'), { theme: 'light' }), /synthetic highlighting failure/);
  failAll = false;
  assert.equal(await renderMarkdown(fence('const failure = 9283;'), { theme: 'light' }), expected('const failure = 9283;', 'typescript'));
  console.log('PASS round 3: grammar recovery, highlight fallback and fatal error retry');

  // Round 4: hard count/payload bounds and LRU refresh/replacement behavior.
  const cache = new MarkdownHighlightCache(2, 1000);
  cache.set('a', 'text', 'light', 'A');
  cache.set('b', 'text', 'light', 'B');
  assert.equal(cache.get('a', 'text', 'light'), 'A');
  cache.set('c', 'text', 'light', 'C');
  assert.equal(cache.get('b', 'text', 'light'), undefined);
  cache.set('huge', 'text', 'light', 'x'.repeat(1000));
  assert.equal(cache.get('a', 'text', 'light'), 'A', 'oversized fence preserves useful entries');
  assert.equal(cache.get('huge', 'text', 'light'), undefined);
  const entryBytes = (JSON.stringify(['t', 'l', 'a']).length + 1) * 2;
  const byteLimited = new MarkdownHighlightCache(100, entryBytes * 2 - 1);
  byteLimited.set('a', 't', 'l', 'A');
  byteLimited.set('b', 't', 'l', 'B');
  assert.equal(byteLimited.get('a', 't', 'l'), undefined, 'byte limit evicts before count limit');
  byteLimited.set('b', 't', 'l', '');
  assert.equal(byteLimited.get('b', 't', 'l'), '');
  const replace = new MarkdownHighlightCache(10, entryBytes * 2);
  replace.set('a', 't', 'l', 'A');
  replace.set('a', 't', 'l', 'A');
  replace.set('b', 't', 'l', 'B');
  assert.equal(replace.get('a', 't', 'l'), 'A', 'replacement removes old byte accounting');
  const disabled = new MarkdownHighlightCache(0, 1000);
  disabled.set('a', 't', 'l', 'A');
  assert.equal(disabled.get('a', 't', 'l'), undefined);
  console.log('PASS round 4: count/byte eviction, hot-entry order, oversized/empty output and replacement');
} finally {
  hl.codeToHtml = original;
  hl.loadLanguage = originalLoad;
}

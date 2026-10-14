import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { renderMarkdown } from '../src/lib/markdown';
import { getHighlighter } from '../src/lib/highlight';

const source = Array.from({ length: 100 }, (_, block) =>
  '```typescript\n' + Array.from({ length: 20 }, (_, line) =>
    `const value${block}_${line}: number = ${block * 20 + line};`).join('\n') + '\n```\n'
).join('\n') + '\nBenchmark prose.';
const hl = await getHighlighter();
const original = hl.codeToHtml.bind(hl);
let calls = 0;
hl.codeToHtml = ((...args: Parameters<typeof hl.codeToHtml>) => {
  calls++;
  return original(...args);
}) as typeof hl.codeToHtml;
const cold = await renderMarkdown(source, { theme: 'light' });
const trials = [];
for (let trial = 0; trial < 5; trial++) {
  calls = 0;
  const started = performance.now();
  const html = await renderMarkdown(source + trial, { theme: 'light' });
  const ms = performance.now() - started;
  assert.equal(html, cold.replace('Benchmark prose.</p>', `Benchmark prose.${trial}</p>`));
  trials.push({ ms: +ms.toFixed(3), highlightCalls: calls });
}
hl.codeToHtml = original;
const medianMs = [...trials].sort((a, b) => a.ms - b.ms)[2].ms;
console.log(JSON.stringify({ chars: source.length, fences: 100, linesPerFence: 20, trials, medianMs }, null, 2));

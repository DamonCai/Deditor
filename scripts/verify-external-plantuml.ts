/** Manual network acceptance: sends only this synthetic diagram to the product's default server. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const output = resolve(process.argv[2] ?? 'tests/artifacts/external-plantuml-2026-09-22');
mkdirSync(output, { recursive: true });
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://deditor-test.invalid' });
Object.defineProperty(dom.window, 'matchMedia', {value: () => ({matches: false, addEventListener() {}, removeEventListener() {}})});
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage });
const { renderMarkdown } = await import('../src/lib/markdown');
const { hydratePlantuml } = await import('../src/lib/plantumlHydrate');
const source = ['@startuml', 'participant Client', 'participant Server', ...Array.from({length: 100}, (_, i) =>
  `Client -> Server: ${i === 0 ? 'FIRST' : i === 99 ? 'LAST' : 'STEP'}_MSG_${String(i + 1).padStart(3, '0')}`), '@enduml'].join('\n');
const markdown = '```plantuml\n' + source + '\n```\n';
writeFileSync(resolve(output, 'large.puml'), source);
writeFileSync(resolve(output, 'large.md'), markdown);
const actualFetch = globalThis.fetch;
const requests: unknown[] = [];
globalThis.fetch = async (...args) => {
  const started = performance.now();
  try {
    const response = await actualFetch(...args);
    requests.push({url: String(args[0]), status: response.status, contentType: response.headers.get('content-type'), responseMs: Math.round(performance.now() - started)});
    return response;
  } catch(error) {
    requests.push({url: String(args[0]), error: String(error), responseMs: Math.round(performance.now() - started)});
    throw error;
  }
};
const started = performance.now();
const results: unknown[] = [];
let passed = false;
try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const root = document.createElement('div');
    root.innerHTML = await renderMarkdown(markdown, { theme: 'light' });
    assert(root.querySelector('.plantuml-diagram[data-plantuml-encoded]'), 'product renderer must produce encoded PlantUML placeholder');
    document.body.append(root);
    const begin = performance.now();
    await hydratePlantuml(root).done;
    const svg = root.querySelector('svg');
    const labels = svg?.textContent ?? '';
    const ok = !!svg && labels.includes('FIRST_MSG_001') && labels.includes('LAST_MSG_100') &&
      Array.from(svg.querySelectorAll('text')).filter(node => /(?:FIRST|STEP|LAST)_MSG_\d{3}/.test(node.textContent ?? '')).length === 100;
    results.push({attempt, hydrateMs: Math.round(performance.now() - begin), passed: ok, viewBox: svg?.getAttribute('viewBox'), width: svg?.getAttribute('width'), height: svg?.getAttribute('height'), error: root.querySelector('.plantuml-error-msg')?.textContent});
    writeFileSync(resolve(output, `attempt-${attempt}.${svg ? 'svg' : 'html'}`), svg?.outerHTML ?? root.innerHTML);
    root.remove();
    if (ok) { passed = true; break; }
  }
} finally {
  globalThis.fetch = actualFetch;
  const report = {date: new Date().toISOString(), environment: 'Node fetch + JSDOM; real product renderMarkdown encoder and hydratePlantuml, no network mocks', sourceSha256: createHash('sha256').update(source).digest('hex'), sourceBytes: Buffer.byteLength(source), messages: 100, passed, elapsedMs: Math.round(performance.now() - started), requests, results};
  writeFileSync(resolve(output, 'result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  dom.window.close();
}
assert(passed, 'real remote SVG must contain all 100 synthetic message labels');

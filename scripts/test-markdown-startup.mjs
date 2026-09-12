import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';

const servers = [];
async function start() {
  const server = await createServer({ logLevel:'error', server:{port:0, host:'127.0.0.1', strictPort:false} });
  servers.push(server); await server.listen();
  return {server, base:`http://127.0.0.1:${server.httpServer.address().port}`};
}
async function get(base, path) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path); return response.text();
}
function imported(code, name) {
  for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
    if (match[1].split(',').some(value => value.trim().split(/\s+as\s+/)[0] === name)) return match[2];
  }
  throw new Error(`Missing import ${name}`);
}
async function check({base}) {
  const component = await get(base, '/src/components/MarkdownVisualEditor.tsx');
  const raw = await get(base, '/src/lib/markdownVisual/raw.ts');
  const core = imported(await get(base, imported(component, 'editorViewCtx')), 'nodesCtx');
  const utility = imported(await get(base, imported(raw, '$nodeSchema')), '$nodeSchema');
  const utilityCore = imported(await get(base, utility), 'nodesCtx');
  const builderCore = imported(await get(base, imported(component, 'CrepeBuilder')), 'Editor');
  assert.equal(utilityCore, core, 'schema plugins and core must use the exact same module URL, including its version');
  assert.equal(builderCore, core, 'Crepe and custom plugins must share the same core');
  return core;
}
try {
  const first = await start(), initial = await check(first);
  const second = await start(); await check(second);
  assert.notEqual(first.server.config.cacheDir, second.server.config.cacheDir);
  assert.equal(await check(first), initial, 'another server cannot rewrite the live module graph');
  await second.server.close();
  assert.equal(existsSync(second.server.config.cacheDir), false, 'closed server releases its own temporary cache');
  assert.equal(existsSync(first.server.config.cacheDir), true, 'other server cache stays live');
  assert.equal(await check(first), initial);
  console.log('PASS Markdown startup: one core identity, isolated concurrent servers and cache cleanup');
} finally { await Promise.allSettled(servers.map(server => server.close())); }

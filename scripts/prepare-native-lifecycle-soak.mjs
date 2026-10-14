// Build a fresh isolated full-app acceptance bundle with real native file I/O.
// Usage: node scripts/prepare-native-lifecycle-soak.mjs --minutes=45
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { zipSync, strToU8 } from 'fflate';
const minutes = Number(process.argv.find(arg => arg.startsWith('--minutes='))?.split('=')[1] ?? 45);
if (!(minutes > 0 && minutes <= 720)) throw new Error('minutes must be in (0, 720]');
const idleSeconds = Number(process.argv.find(arg => arg.startsWith('--idle-seconds='))?.split('=')[1] ?? 120);
if (!(idleSeconds >= 0 && idleSeconds <= 3600)) throw new Error('idle-seconds must be in [0, 3600]');
const stamp = Date.now().toString();
const root = path.resolve('tests/artifacts/native-lifecycle-soak', stamp);
fs.mkdirSync(root, { recursive: true });
const source = '# Native lifecycle acceptance\n\n' + Array.from({ length: 200 }, (_, i) =>
  `## Section ${i}\n\n自建长文 ${i}。 ` + 'Native editing **bold** and resource lifecycle. '.repeat(9) + '\n\n| Name | Value |\n| --- | --- |\n| 中文 | 42 |\n\n').join('');
fs.writeFileSync(path.join(root, 'long.md'), source);
const sheets = Array.from({ length: 3 }, (_, s) => ({ id: 'sheet-' + s, title: 'Sheet ' + (s + 1), rootTopic: {
  id: 'root-' + s, title: 'Native large map ' + s, children: { attached: Array.from({ length: 20 }, (_, i) => ({
    id: s + '-branch-' + i, title: 'Branch ' + i, children: { attached: Array.from({ length: 49 }, (_, j) => ({ id: `${s}-${i}-${j}`, title: `Node 中文 ${i}/${j}` })) },
  })) },
} }));
fs.writeFileSync(path.join(root, 'large.xmind'), zipSync({ 'content.json': strToU8(JSON.stringify(sheets)), 'metadata.json': strToU8('{}'), 'manifest.json': strToU8('{}') }));
const frontend = path.join(root, 'frontend');
await build({ build: { outDir: frontend }, define: { __NATIVE_SOAK_ROOT__: JSON.stringify(root), __NATIVE_SOAK_MINUTES__: String(minutes), __NATIVE_SOAK_IDLE_SECONDS__: String(idleSeconds) },
  plugins: [{ name: 'isolated-native-soak', transformIndexHtml: { order: 'pre', handler: html => html.replace('</body>', '<script type="module" src="/tests/diagnostics/native-lifecycle-soak.ts"></script></body>') } }] });
const config = path.join(root, 'tauri.soak.json');
fs.writeFileSync(config, JSON.stringify({ productName: 'DEditor Native Soak ' + stamp, identifier: 'com.deditor.nativesoak' + stamp,
  build: { frontendDist: frontend, beforeBuildCommand: '' }, bundle: { fileAssociations: [] } }, null, 2));
console.log(JSON.stringify({ root, config, minutes, idleSeconds }));

// Copy a built frontend and add a read-only native window state observer.
// Does not edit src, dist, or the separate pane-resize diagnostic output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
const source = path.resolve(process.argv[2] ?? 'dist');
const output = path.resolve(process.argv[3] ?? 'tests/artifacts/native-desktop-diagnostic-2026-09-22');
if (source === output || output.startsWith(source + path.sep)) throw new Error('Diagnostic output must be outside source dist');
if (fs.existsSync(output)) throw new Error('Choose a fresh output directory; existing diagnostic evidence is not overwritten');
const index = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
if (!index.includes('</body>')) throw new Error('Source is not a built frontend index');
const target = path.join(output, 'frontend');
fs.mkdirSync(output, { recursive: true });
fs.cpSync(source, target, { recursive: true });
await build({ entryPoints: ['tests/diagnostics/native-desktop.ts'], outfile: path.join(target, 'desktop-diagnostic.js'),
  bundle: true, format: 'esm', platform: 'browser', define: { __DESKTOP_DIAG_DIR__: JSON.stringify(output) }, logLevel: 'silent' });
fs.writeFileSync(path.join(target, 'index.html'), index.replace('</body>', '<script type="module" src="/desktop-diagnostic.js"></script></body>'));
const config = path.join(output, 'tauri.desktopdiagnostic.json');
fs.writeFileSync(config, JSON.stringify({ productName: 'DEditor Desktop Diagnostic', identifier: 'com.deditor.desktopdiagnostic20260922',
  build: { frontendDist: target, beforeBuildCommand: '' } }, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ source, sourceIndexSha256: crypto.createHash('sha256').update(index).digest('hex'),
  entry: 'tests/diagnostics/native-desktop.ts', output: target, created: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify({ frontend: target, config, logs: path.join(output, 'desktop-<window-label>-<started>.json') }, null, 2));

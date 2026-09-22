// Copies a built frontend and injects an observer. Never edits source/dist.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { build } from 'esbuild';
const source=path.resolve(process.argv[2] ?? 'dist');
const output=path.resolve(process.argv[3] ?? 'tests/artifacts/native-pane-resize-2026-09-22');
if(source===output || output.startsWith(source+path.sep))throw new Error('Diagnostic output must be outside source dist');
const index=fs.readFileSync(path.join(source,'index.html'),'utf8');
const target=path.join(output,'frontend');
fs.mkdirSync(output,{recursive:true});fs.cpSync(source,target,{recursive:true});
await build({entryPoints:['tests/diagnostics/native-pane-resize.ts'],outfile:path.join(target,'pane-resize-diagnostic.js'),bundle:true,format:'esm',platform:'browser',define:{__DIAG_LOG_PATH__:JSON.stringify(path.join(output,'events.json'))},logLevel:'silent'});
fs.writeFileSync(path.join(target,'index.html'),index.replace('</body>','<script type="module" src="/pane-resize-diagnostic.js"></script></body>'));
fs.writeFileSync(path.join(output,'tauri.diagnostic.json'),JSON.stringify({productName:'DEditor Divider Diagnostic',identifier:'com.deditor.dividerdiagnostic20260922',build:{frontendDist:target,beforeBuildCommand:''}},null,2)+'\n');
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({source,sourceIndexSha256:crypto.createHash('sha256').update(index).digest('hex'),entry:'tests/diagnostics/native-pane-resize.ts',output:target,created:new Date().toISOString()},null,2)+'\n');
console.log(JSON.stringify({frontend:target,config:path.join(output,'tauri.diagnostic.json'),log:path.join(output,'events.json')},null,2));

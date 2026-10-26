import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import React, { act } from 'react';
const dom = new JSDOM('<body><button id="invoker">Settings</button><div id="root"></div>', { url:'http://localhost', pretendToBeVisual:true });
for (const key of ['window','document','HTMLElement','Event','KeyboardEvent','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.getComputedStyle=dom.window.getComputedStyle.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const { createRoot } = await import('react-dom/client');
const output=path.resolve('node_modules/.cache/deditor-test-updates.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const errors=[], commands=[], opened=[], revealed=[];
let checkResult, checkError, downloadError, resolveDownload, savePath='/generated/DEditor.dmg';
globalThis.updateInvoke=async(command,args)=>{
 commands.push(command);
 if(command==='check_for_updates'){ if(checkError)throw checkError;return structuredClone(checkResult); }
 if(command==='download_update'){
  assert.equal(args.assetId,1);assert.equal(args.destination,savePath);assert.equal(args.expectedSha256,'ab'.repeat(32));
  if(downloadError)throw downloadError;
  args.onProgress.onmessage({downloaded:50,total:100});
  await new Promise(resolve=>{resolveDownload=resolve;});
 }
};
globalThis.updateSave=async()=>savePath;
globalThis.updateOpen=async url=>opened.push(url);
globalThis.updateReveal=async value=>revealed.push(value);
globalThis.updateError=async value=>errors.push(value);
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...args)=>globalThis.updateInvoke(...args); export class Channel {}',
 '@tauri-apps/plugin-dialog':'export const save=()=>globalThis.updateSave();',
 '@tauri-apps/plugin-opener':'export const openUrl=u=>globalThis.updateOpen(u);export const revealItemInDir=p=>globalThis.updateReveal(p);',
};
await build({stdin:{contents:`export {default as Dialog} from './src/components/UpdateDialog'; export {useEditorStore} from './src/store/editor';`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='feedback'?'export const showError=m=>globalThis.updateError(m);':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const {Dialog,useEditorStore}=await import(pathToFileURL(output));
const root=createRoot(document.getElementById('root'));
let closed=0;
const fixture={currentVersion:'1.0.3',builtAt:100,platform:'macos',arch:'aarch64',version:'1.0.4',publishedAt:'2026-10-25T16:08:15Z',releaseUrl:'https://github.com/DamonCai/Deditor/releases/tag/1.0.4',notes:'# Generated release\n<script>generatedUnsafe()</script>',status:'new_version',installerBuiltAt:200,installer:{id:1,name:'DEditor_1.0.4_aarch64.dmg',size:100,updatedAt:'2026-10-25T16:08:15Z',sha256:'ab'.repeat(32)}};
const click=async(button)=>act(async()=>{button.click();});
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
async function mount(overrides={}){
 await act(async()=>root.render(null));
 checkResult={...fixture,...overrides};checkError=null;downloadError=null;savePath='/generated/DEditor.dmg';
 document.getElementById('invoker').focus();
 await act(async()=>root.render(React.createElement(Dialog,{onClose:()=>closed++})));
}
let passed=0;
try {
 // Round 1: language, status, notes isolation, retry and focus.
 for(const language of ['zh','en']){
  await act(async()=>useEditorStore.setState({language}));
  await mount();
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.ok(document.querySelector('[role="dialog"]').contains(document.activeElement));
  assert.equal(document.querySelectorAll('script').length,0);
  assert.ok(document.querySelector('pre').textContent.includes('<script>'));
  assert.ok(button(language==='zh'?'下载安装包':'Download Installer'));
  await act(async()=>{button(language==='zh'?'关闭':'Close').focus();document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));});
  assert.equal(document.activeElement,button(language==='zh'?'检查更新':'Check for Updates'));
  await click(button(language==='zh'?'GitHub 发布页':'GitHub Releases'));assert.equal(opened.at(-1),fixture.releaseUrl);
 }
 passed++;console.log('PASS round 1: zh/en, focus, notes rendered as text, release page');
 // Round 2: same-version fallback, missing packages/digests and network retry.
 useEditorStore.setState({language:'en'});
 await mount({status:'same_version_unknown',version:'1.0.3',installerBuiltAt:null});
 assert.ok(document.body.textContent.includes('does not establish'));
 await mount({installer:null});assert.equal(button('Download Installer'),undefined);
 assert.ok(document.body.textContent.includes('no installer'));
 await mount({installer:{...fixture.installer,sha256:null}});assert.ok(button('Download Installer').disabled);
 checkError='rate_limited';await click(button('Check for Updates'));assert.ok(document.querySelector('[role="alert"]').textContent.includes('rate limit'));
 checkError=null;await click(button('Check for Updates'));assert.equal(document.querySelector('[role="alert"]'),null);
 passed++;console.log('PASS round 2: same version, no matching asset, no checksum, retry');
 // Round 3: save cancellation, progress, duplicate prevention, protected close and reveal.
 await mount();savePath=null;let count=commands.length;await click(button('Download Installer'));
 assert.deepEqual(commands.slice(count),[]);assert.equal(button('Download Installer').disabled,false);
 savePath='/generated/DEditor.dmg';await click(button('Download Installer'));
 assert.ok(button('Close').disabled);assert.ok(button('Download Installer').disabled);
 assert.equal(document.querySelector('progress').value,50);
 count=closed;
 await act(async()=>{document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});assert.equal(closed,count);
 await act(async()=>resolveDownload());assert.ok(document.body.textContent.includes('SHA-256 verified'));
 await click(button('Show Installer'));assert.equal(revealed.at(-1),savePath);
 await act(async()=>{document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});assert.equal(closed,count+1);
 passed++;console.log('PASS round 3: cancel, progress, disabled controls, Esc, checksum success and reveal');
 // Round 4: checksum/write/change errors stay retryable; packaging metadata binds final bytes.
 for(const error of ['checksum_failed','write_failed','release_changed']){
  await mount();downloadError=error;await click(button('Download Installer'));
  assert.ok(errors.at(-1));assert.equal(button('Download Installer').disabled,false);assert.equal(button('Show Installer'),undefined);
 }
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deditor-update-fixture-'));
 try {
  const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
  const filename=path.join(dir,`DEditor_${version}_aarch64.dmg`);fs.writeFileSync(filename,'generated installer bytes');
  execFileSync(process.execPath,['scripts/update-metadata.mjs',filename],{env:{...process.env,DEDITOR_BUILD_TIME:'123456'}});
  const metadata=JSON.parse(fs.readFileSync(`${filename}.build.json`,'utf8'));
  assert.equal(metadata.version,version);
  assert.equal(metadata.builtAt,123456);assert.equal(metadata.filename,path.basename(filename));assert.equal(metadata.size,fs.statSync(filename).size);
  assert.equal(metadata.sha256,createHash('sha256').update(fs.readFileSync(filename)).digest('hex'));
  assert.throws(()=>execFileSync(process.execPath,['scripts/update-metadata.mjs',filename],{env:{...process.env,DEDITOR_BUILD_TIME:''},stdio:'pipe'}));
  const stale=path.join(dir,'DEditor_0.0.0_aarch64.dmg');fs.writeFileSync(stale,'old fixture');
  assert.throws(()=>execFileSync(process.execPath,['scripts/update-metadata.mjs',stale],{env:{...process.env,DEDITOR_BUILD_TIME:'123456'},stdio:'pipe'}));
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
 passed++;console.log('PASS round 4: checksum/write/release errors and packaging sidecar');
} finally { await act(async()=>root.unmount());fs.rmSync(output,{force:true});dom.window.close(); }
console.log(`${passed} update workflow rounds passed (generated fixtures and mocked native IPC).`);

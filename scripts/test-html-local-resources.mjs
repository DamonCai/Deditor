import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deditor-html-local-'));
fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir');
const dom=new JSDOM('<!doctype html><body>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','DOMParser','HTMLElement','Node','Element','localStorage'])globalThis[name]=dom.window[name];
window.matchMedia=()=>({matches:false});
const calls=[],errors=[];
globalThis.htmlLocalTest={invoke:async(cmd,args)=>{calls.push([cmd,args]);if(cmd==='read_text_file'){if(args.path.includes('missing'))throw new Error('No such file');if(args.path.includes('legacy'))throw new Error('stream did not contain valid UTF-8');return '<!doctype html><title>自建 HTML</title><p>完整源码</p>'; }if(cmd==='read_binary_as_base64'){if(args.path.includes('missing'))throw new Error('No such file');return 'AA==';}},error:message=>errors.push(message)};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.htmlLocalTest.invoke(...a);export const convertFileSrc=p=>"http://asset.localhost/"+encodeURIComponent(p);',
 './feedback':'export const showError=async m=>globalThis.htmlLocalTest.error(m);',
 './logger':'export const logInfo=()=>{};export const logWarn=()=>{};export const logError=()=>{};',
 './format':'export const formatBuffer=async()=>null;',
};
try {
 const out=path.join(dir,'bundle.mjs');
 await build({stdin:{contents:`export * from './src/lib/htmlPreview';export * from './src/lib/fileio';export {useEditorStore} from './src/store/editor';`,resolveDir:process.cwd()},outfile:out,bundle:true,format:'esm',platform:'node',packages:'external',logLevel:'silent',plugins:[{name:'stubs',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));}}]});
 const app=await import(pathToFileURL(out)),store=app.useEditorStore;
 const parse=source=>new DOMParser().parseFromString(source,'text/html');
 const preview=(source,file='/generated/index.html')=>parse(app.buildHtmlPreview(source,file));
 for(const base of ['file:///generated/assets/','C:\\generated\\assets\\','../assets/']) {
  const doc=preview(`<base href="${base}" target="preview-window"><script src="helper.js"></script><link rel="stylesheet" href="style.css"><img src="dot.svg">`);
  assert.match(doc.querySelector('base').href,/^http:\/\/asset.localhost\//);
  assert.equal(doc.querySelector('base').target,'preview-window');
  assert.match(doc.querySelector('script').src,/assets\/helper.js$/);
  assert.match(doc.querySelector('link').href,/assets\/style.css$/);
 }
 const percentBase=preview('<base href="file:///generated/draft%2520/%E4%B8%AD%E6%96%87%20%23/"><img src="dot.svg">');
 assert.match(percentBase.querySelector('base').href,/draft%2520\/%E4%B8%AD%E6%96%87%20%23\/$/);assert.match(percentBase.querySelector('img').src,/draft%2520\/%E4%B8%AD%E6%96%87%20%23\/dot.svg$/);
 const targeted=preview('<base target="_blank"><base href="../assets/"><base target="ignored" href="https://ignored.invalid/"><a href="#here">jump</a>');
 assert.equal(targeted.querySelectorAll('base').length,1);assert.equal(targeted.querySelector('base').target,'_blank');assert.equal(targeted.querySelector('a').getAttribute('href'),'about:srcdoc#here');
 console.log('Round 1 PASS: file/drive/relative base, first target semantics, relative script/style and fragment');
 const doc=preview('<svg><image xlink:href="file:///generated/a%20b.svg#view"/><use href="file:///generated/symbols.svg#mark"/></svg><form action="file:///generated/result.html"><button formaction="C:\\generated\\other.html">go</button></form><object data="file:///generated/preview.html"></object><video poster="file:///generated/poster.svg"><source src="file:///generated/clip.mp4#t=2"></video>');
 for(const [selector,attr] of [['image','xlink:href'],['use','href'],['form','action'],['button','formaction'],['object','data'],['video','poster'],['source','src']]) assert.match(doc.querySelector(selector).getAttribute(attr),/^http:\/\/asset.localhost\//);
 assert.equal(doc.querySelector('image').getAttributeNS('http://www.w3.org/1999/xlink','href'),doc.querySelector('image').getAttribute('xlink:href'));
 assert.match(doc.querySelector('image').getAttribute('xlink:href'),/a%20b.svg#view$/);assert.match(doc.querySelector('source').src,/#t=2$/);
 const sets=preview('<picture><source srcset="file:///generated/a.svg 1x, file:///generated/b.svg 2x"><img srcset="data:image/svg+xml,%3Csvg%3E 1x, file:///generated/c.svg 2x, ./relative.svg 3x" src="fallback.svg"></picture>');
 assert.equal(sets.querySelector('source').getAttribute('srcset'),'http://asset.localhost//generated/a.svg 1x, http://asset.localhost//generated/b.svg 2x');
 assert.equal(sets.querySelector('img').getAttribute('srcset'),'data:image/svg+xml,%3Csvg%3E 1x, http://asset.localhost//generated/c.svg 2x, ./relative.svg 3x');
 console.log('Round 2 PASS: SVG namespaces, form destinations, media fragments and data-aware responsive images');
 const source='<base href="https://example.invalid/assets/" target="preview"><meta http-equiv="refresh" content="30"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><script>document.title=42</script><button onclick="this.textContent=42">run</button><iframe srcdoc="<p>child</p>"></iframe>';
 const unchanged=preview(source);assert.equal(unchanged.querySelector('base').href,'https://example.invalid/assets/');assert.equal(unchanged.querySelector('meta[http-equiv="refresh"]').content,'30');assert.equal(unchanged.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length,1);assert.equal(unchanged.querySelector('button').getAttribute('onclick'),'this.textContent=42');assert.ok(unchanged.querySelector('iframe[srcdoc]'));assert.doesNotMatch(app.HTML_PREVIEW_SANDBOX,/allow-same-origin|allow-top-navigation/);assert.equal(app.buildHtmlPreview(source,'/generated/index.html'),app.buildHtmlPreview(source,'/generated/index.html'));
 console.log('Round 3 PASS: authored script/CSP/refresh/remote base retained, no origin escalation, deterministic rendering');
 store.setState({tabs:[],activeId:null,panes:null,language:'en'});
 await app.openFileByPath('/generated/report.HTML');assert.equal(store.getState().tabs.length,1);assert.match(store.getState().tabs[0].content,/完整源码/);const id=store.getState().activeId;store.getState().setContent('unsaved HTML',id,'command');await app.openFileByPath('/generated/report.HTML');assert.equal(store.getState().tabs[0].content,'unsaved HTML');assert.equal(calls.filter(([cmd])=>cmd==='read_text_file').length,1);
 await app.openFileByPath('/generated/missing.html');assert.equal(errors.length,1);assert.match(errors[0],/Could not open.*missing.html[\s\S]*No such file/);assert.equal(store.getState().tabs.length,1);
 await app.openFileByPath('/generated/missing-again.html',{reportError:false});assert.equal(errors.length,1);
 await app.openFileByPath('/generated/legacy.html');assert.equal(errors.length,2);assert.match(errors[1],/valid UTF-8/);assert.equal(store.getState().tabs[0].content,'unsaved HTML');
 console.log('Round 4 PASS: HTML open/reuse preserves dirty text, missing/encoding errors are visible, inline feedback opts out');
 store.setState({language:'zh'});await app.openFileByPath('/generated/missing.png');assert.equal(errors.length,3);assert.match(errors[2],/无法打开「missing.png」/);assert(!calls.some(([cmd,args])=>cmd==='add_recent_document'&&args.path==='/generated/missing.png'));
 await app.openMany(['/generated/missing-third.html','/generated/next.htm']);assert(store.getState().tabs.some(t=>t.filePath==='/generated/next.htm'));assert.equal(errors.length,4);assert(!calls.some(([cmd])=>cmd==='write_text_file'));
 console.log('Round 5 PASS: binary error feedback, failed opens excluded from OS history, batch continues, no source writes');
} finally {dom.window.close();fs.rmSync(dir,{recursive:true,force:true});}

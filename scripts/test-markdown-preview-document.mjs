import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<!doctype html><body>',{url:'http://localhost'});
for(const key of ['window','document','Node','Element','HTMLElement','localStorage','DOMParser']) globalThis[key]=dom.window[key];
window.__TAURI_INTERNALS__={convertFileSrc:p=>'http://asset.localhost/'+encodeURIComponent(p)};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const out=path.resolve('node_modules/.cache/markdown-preview-document.mjs');fs.mkdirSync(path.dirname(out),{recursive:true});
await build({stdin:{contents:"export * from './src/lib/markdownPreviewDocument';export {markdownDisplayHtml} from './src/lib/markdownDisplay';export {renderMarkdown} from './src/lib/markdown';export {hydrateHtmlFrames} from './src/lib/htmlFrameHydrate';",resolveDir:process.cwd()},outfile:out,platform:'node',format:'esm',bundle:true,packages:'external',logLevel:'silent',plugins:[{name:'isolated-hydration',setup(b){b.onResolve({filter:/\.css$/},a=>({path:a.path,namespace:'empty'}));b.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));b.onResolve({filter:/^(\.\/mermaidHydrate|\.\/plantumlHydrate|\.\/legacyDiagramHydrate|\.\/localImgHydrate)$/},a=>({path:a.path,namespace:'hydration'}));b.onLoad({filter:/.*/,namespace:'hydration'},()=>({contents:'export const hydrateLocalImages=()=>{};export const hydrateMermaid=()=>Object.assign(new AbortController(),{done:Promise.resolve()});export const hydratePlantuml=hydrateMermaid;export const hydrateLegacyDiagrams=hydrateMermaid;'}));}}]});
const {MarkdownPreviewCache,MarkdownPreviewDocument,markdownDisplayHtml,renderMarkdown,hydrateHtmlFrames}=await import(pathToFileURL(out));
const options={theme:'light',filePath:'/generated/test.md',imageRoot:null};
function canonical(html){const t=document.createElement('template');t.innerHTML=html;function walk(n){if(n.nodeType===1)return [n.tagName,[...n.attributes].map(a=>[a.name,a.value]).sort(),[...n.childNodes].map(walk)];return [n.nodeType,n.textContent];}return [...t.content.childNodes].map(walk);}
const source='# Title\n\nBefore **bold** [file](file:///tmp/a.md).\n\n> Quote\n>\n> - nested\n\n| A | B |\n| --- | --- |\n| **bold** | x<br>y |\n\n```typescript\nconst text = \' data-line="12" <fake>\';\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\n```html\n<svg viewBox="0 0 20 10"><rect width="20" height="10" onclick="bad()"/></svg><script>bad()</script>\n```\n\n$$a^2$$\n\nFootnote[^a]\n\n[^a]: rich **note**\n\n<details><summary>Summary</summary><p>Content</p></details>\n';
const raw=await renderMarkdown(source,options);
const renderedFence=document.createElement('div');renderedFence.innerHTML=markdownDisplayHtml(raw);assert.ok(renderedFence.querySelector('.html-render-block iframe'));assert.equal(renderedFence.querySelector('.html-render-block script'),null);hydrateHtmlFrames(renderedFence,options.filePath);assert.match(renderedFence.querySelector('.html-render-block iframe').srcdoc,/onclick=/);assert.equal(renderedFence.querySelector('.html-render-block pre'),null);
for(const html of [raw,'&lt;img src=x onerror=alert(1)&gt; &amp; literal','<p data-line="9" onclick="alert(1)">safe<script>bad()</script></p><iframe src="https://example.com" srcdoc="bad"></iframe><a href="file:///tmp/a.md">file</a>','<div data-deditor-preview-line="98"><p data-line="7">x</p></div>','<table><tbody><tr><td>a</td></tr></tbody></table><!-- comment --><p>tail</p>']){
 const cache=new MarkdownPreviewCache(),root=document.createElement('div'),display=new MarkdownPreviewDocument(root);document.body.append(root);display.update(cache.prepare(html),options);
 const expected=document.createElement('div');expected.innerHTML=markdownDisplayHtml(html);hydrateHtmlFrames(expected,options.filePath);for(const el of expected.querySelectorAll('[data-deditor-preview-line]'))el.removeAttribute('data-deditor-preview-line');
 assert.deepEqual(canonical(root.innerHTML),canonical(expected.innerHTML));display.destroy();root.remove();
}
console.log('PASS complex syntax, raw HTML, escaped text and sanitization match shared display');
const cache=new MarkdownPreviewCache(),root=document.createElement('div'),display=new MarkdownPreviewDocument(root);document.body.append(root);
const initial='<p data-line="1">one</p><details data-line="3"><summary>Summary</summary><p data-line="4">same</p></details><p data-line="6">duplicate</p><p data-line="8">duplicate</p>';
display.update(cache.prepare(initial),options);const details=root.querySelector('details'),duplicates=[...root.querySelectorAll('p')].slice(-2);details.open=true;
display.update(cache.prepare(initial.replace('one','changed').replace('data-line="3"','data-line="4"').replace('data-line="4">same','data-line="5">same')),options);
assert.equal(root.querySelector('details'),details);assert.equal(details.open,true);assert.equal(details.dataset.line,'4');assert.equal(details.querySelector('p').dataset.line,'5');assert.deepEqual([...root.querySelectorAll('p')].slice(-2),duplicates);
display.update(cache.prepare('<h2 data-line="1">new</h2>'+initial),options);assert.equal(root.querySelector('details'),details);assert.equal(root.firstElementChild.tagName,'H2');
display.update(cache.prepare('<p>only</p>'),options);assert.equal(root.textContent,'only');assert.equal(details.isConnected,false);
display.update([],options);assert.equal(root.childNodes.length,0);display.destroy();dom.window.close();
console.log('PASS unchanged and duplicate blocks retain identity; line updates, insertion, deletion and eviction work');

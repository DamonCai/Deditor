import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<!doctype html><body>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','DOMParser','Node','Element','HTMLElement','localStorage'])globalThis[key]=dom.window[key];
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.__TAURI_INTERNALS__={convertFileSrc:p=>'http://asset.localhost/'+encodeURIComponent(p),invoke:async()=>{}};
const out=path.resolve('node_modules/.cache/preview-restrictions.mjs');fs.mkdirSync(path.dirname(out),{recursive:true});
await build({stdin:{contents:`export * from './src/lib/htmlPreview';export * from './src/lib/htmlFrameHydrate';export * from './src/lib/localImgHydrate';export * from './src/lib/markdownDisplay';export {renderMarkdown} from './src/lib/markdown';`,resolveDir:process.cwd()},outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},logLevel:'silent'});
const app=await import(pathToFileURL(out));
const box=html=>{const root=document.createElement('div');root.innerHTML=html;return root;};
const parse=html=>new DOMParser().parseFromString(html,'text/html');
const source='<meta http-equiv="refresh" content="10"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'"><script>new Function("return 42")()</script><iframe srcdoc="<p>child</p>"></iframe><form><button>send</button></form><a target="_blank" download href="data:text/plain,generated">download</a>';
const doc=parse(app.buildHtmlPreview(source,'/generated/doc.html'));
assert.equal(doc.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length,1);
assert.equal(doc.querySelector('meta[http-equiv="Content-Security-Policy"]').content,"connect-src 'none'");
assert.equal(doc.querySelector('meta[http-equiv="refresh"]').content,'10');
assert.match(doc.querySelector('script').textContent,/new Function/);assert.ok(doc.querySelector('iframe[srcdoc]'));assert.ok(doc.querySelector('form'));
for(const permission of ['allow-scripts','allow-forms','allow-downloads','allow-popups'])assert.ok(app.HTML_PREVIEW_SANDBOX.split(' ').includes(permission));
assert.doesNotMatch(app.HTML_PREVIEW_SANDBOX,/allow-same-origin|allow-top-navigation/);
console.log('PASS round 1: authored scripts, CSP, refresh, forms, nested frames and document actions survive');

for(const filePath of ['/generated/中文 文档.html','C:\\generated\\中文.htm',null]) {
 const doc=parse(app.buildHtmlPreview('<img src="file:///generated/a%20b.svg"><video src="file:///generated/a.mp4#t=2" poster="file:///generated/poster.svg"></video><script src="file:///generated/a.js"></script><a href="#node">jump</a>',filePath));
 assert.match(doc.querySelector('img').src,/asset.localhost/);assert.match(doc.querySelector('video').src,/#t=2$/);assert.match(doc.querySelector('video').poster,/asset.localhost/);assert.match(doc.querySelector('script').src,/asset.localhost/);assert.equal(doc.querySelector('a').getAttribute('href'),'about:srcdoc#node');
}
const media=box(app.markdownDisplayHtml('<img src="file:///generated/a.svg"><audio src="../tone.wav#t=1"></audio><video src="./clip.mp4" poster="./poster.svg"><source src="./alternate.webm"><track src="./captions.vtt"></video><iframe src="../page.html"></iframe>'));
app.hydrateLocalImages(media,'/generated/docs/a.md');
for(const el of media.querySelectorAll('[src]'))assert.match(el.getAttribute('src'),/^http:\/\/asset.localhost\//);
assert.match(media.querySelector('video').getAttribute('poster'),/poster.svg/);assert.match(media.querySelector('audio').src,/#t=1$/);
const hydrated=media.innerHTML;app.hydrateLocalImages(media,'/generated/docs/a.md');assert.equal(media.innerHTML,hydrated);
const mounted=box('<video><source src="./clip.mp4"></video>');document.body.append(mounted);let loads=0;mounted.querySelector('video').load=()=>loads++;app.hydrateLocalImages(mounted,'/generated/docs/a.md');assert.equal(loads,1);app.hydrateLocalImages(mounted,'/generated/docs/a.md');assert.equal(loads,1);mounted.remove();
const svg=box(app.markdownDisplayHtml('<svg><image href="file:///generated/a.svg"/><use href="./icons.svg#mark"/><use href="#internal"/></svg>'));app.hydrateLocalImages(svg,'/generated/docs/a.md');assert.match(svg.querySelector('image').getAttribute('href'),/asset.localhost/);assert.match(svg.querySelector('use').getAttribute('href'),/asset.localhost.*#mark$/);assert.ok(svg.querySelector('use[href="#internal"]'));
console.log('PASS round 2: file URLs, Windows/Unicode, relative media, posters, captions, fragments and repeated hydration');

const interactive='<section><button onclick="this.textContent=42">run</button><script>document.body.dataset.ready="yes"</script></section>';
for(const source of ['```html\n'+interactive+'\n```\n',interactive+'\n']) {
 const rendered=box(app.markdownDisplayHtml(await app.renderMarkdown(source,{theme:'light'})));
 const frame=rendered.querySelector('.html-render-block iframe');assert.ok(frame);assert.equal(rendered.querySelector('script'),null);
 app.hydrateHtmlFrames(rendered,'/generated/doc.md');assert.match(frame.srcdoc,/dataset.ready/);assert.match(frame.srcdoc,/onclick=/);assert.match(frame.srcdoc,/base href="http:\/\/asset.localhost/);
 const before=frame.srcdoc;app.hydrateHtmlFrames(rendered,'/generated/doc.md');assert.equal(frame.srcdoc,before);
 app.hydrateHtmlFrames(rendered,'/elsewhere/doc.md');assert.notEqual(frame.srcdoc,before);
}
const staticSvg=box(app.markdownDisplayHtml(await app.renderMarkdown('```html\n<svg viewBox="0 0 20 10"><rect width="20" height="10"/></svg>\n```',{theme:'light'})));
assert.ok(staticSvg.querySelector('svg rect'));assert.equal(staticSvg.querySelector('iframe'),null);
console.log('PASS round 3: fenced/raw dynamic documents, document base changes and static SVG compatibility');

const frames=box(app.markdownDisplayHtml('<iframe title="local" src="file:///generated/embed.html" allowfullscreen></iframe><iframe title="inline" srcdoc="&lt;button onclick=&quot;this.textContent=42&quot;&gt;run&lt;/button&gt;"></iframe><iframe src="javascript:alert(1)"></iframe>'));
assert.ok(frames.querySelector('iframe[title="local"][allowfullscreen]'));app.hydrateHtmlFrames(frames,'/generated/doc.md');assert.match(frames.querySelector('iframe[title="inline"]').srcdoc,/onclick=/);
assert.equal(frames.querySelector('iframe[src^="javascript:"]'),null);assert.equal(frames.querySelector('script'),null);
for(const frame of frames.querySelectorAll('iframe'))assert.doesNotMatch(frame.getAttribute('sandbox'),/allow-same-origin/);
const scripted=box(app.markdownDisplayHtml('<iframe srcdoc="<script>document.body.textContent=42</script>"></iframe>'));app.hydrateHtmlFrames(scripted,'/generated/doc.md');assert.match(scripted.querySelector('iframe').srcdoc,/<script>document.body.textContent=42<\/script>/);
console.log('PASS round 4: local and inline embeds retain behavior without acquiring the editor origin');
dom.window.close();

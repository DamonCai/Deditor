import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost'});
for(const name of ['window','document','HTMLElement','Node','DOMParser'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
Object.defineProperty(globalThis,'localStorage',{value:dom.window.localStorage,configurable:true});
const output=path.resolve('node_modules/.cache/deditor-fragment-context.mjs');
await build({entryPoints:['src/lib/markdownFragments.ts'],outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'controlled-render',setup(b){
 b.onLoad({filter:/markdownFragments\.ts$/},a=>({contents:fs.readFileSync(a.path,'utf8').replace('from "./markdown"','from "test-fragment-render"'),loader:'ts'}));
 b.onResolve({filter:/^test-fragment-render$/},()=>({path:'render',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:`import {renderMarkdown as actual, renderMarkdownTocs as renderMarkdownTocsActual} from ${JSON.stringify(path.resolve('src/lib/markdown.ts'))}; globalThis.fragmentActual=actual; export const renderMarkdownTocs=(...args)=>globalThis.fragmentTocs ? globalThis.fragmentTocs(...args) : renderMarkdownTocsActual(...args); export const renderMarkdown=(...args)=>globalThis.fragmentRender ? globalThis.fragmentRender(...args) : actual(...args);`,resolveDir:process.cwd(),loader:'js'}));
}}],logLevel:'silent'});
const {renderMarkdownFragment:fragment,clearMarkdownFragmentContext:clear}=await import(pathToFileURL(output));
let templates=0;
const create=document.createElement.bind(document);
document.createElement=(...args)=>{if(args[0]==='template')templates++;return create(...args);};
const light={theme:'light'}, dark={theme:'dark'}, owner={};
const source='[toc]\n\n# Header\n\nText [link][ref] and note[^n].\n\n[ref]: https://example.com/path\n\n[^n]: Footnote **bold**.\n';
const [toc,heading,note,ref]=await Promise.all([
 fragment('[toc]',source,1,light,owner),fragment('# Header',source,3,light,owner),
 fragment('[^n]: Footnote **bold**.',source,9,light,owner),fragment('Text [link][ref] and note[^n].',source,5,light,owner),
]);
assert.equal(templates,1,'concurrent contextual blocks parse the full HTML once');
assert.match(toc,/href="#header"/);assert.match(heading,/>Header<\/h1>/);assert.match(note,/Footnote <strong>bold<\/strong>/);assert.match(ref,/https:\/\/example.com\/path/);assert.match(ref,/footnote-ref/);
const one=create('div'),two=create('div');one.innerHTML=heading;two.innerHTML=await fragment('# Header',source,3,light,owner);
one.firstChild.remove();assert.match(two.textContent,/Header/);assert.match(await fragment('# Header',source,3,light,owner),/>Header<\/h1>/);assert.equal(templates,1);
console.log('PASS real TOC/reference/footnote context and independent caller DOM');
// The TOC fast path must be byte-for-byte equivalent to the matching nav in
// the full renderer, including context which a heading regex cannot resolve.
const tocSources=[
 '[toc]\n\n# Repeat\n\n# Repeat\n\n## 中文 **粗体** `code` ![image](image.png)\n',
 '---\ntitle: generated\n---\n\n[toc]\n\n# [Reference][id]\n\n[id]: https://example.com\n\n> ## Quoted\n\n- ### Listed\n',
 '[toc]\n\n```md\n# Not a heading\n```\n\nSetext heading\n===\n\n# Escaped \\*literal\\* &amp; entity\n\n[[toc]]\n',
 '[toc]\r\n\r\n# Heading\r\n\r\nNote[^n].\r\n\r\n[^n]: Footnote\r\n\r\n    ## Nested footnote heading\r\n',
 '> [toc]\n>\n> # Nested TOC\n\n# Outer\n',
];
for(const source of tocSources)for(const options of [light,dark]){
 const expected=create('template');expected.innerHTML=await globalThis.fragmentActual(source,options);
 const navs=[...expected.content.querySelectorAll('.md-toc')];assert.ok(navs.length);
 const count=templates;
 const actual=await Promise.all(navs.map(nav=>fragment('[toc]',source,Number(nav.dataset.line),options,owner)));
 assert.deepEqual(actual,navs.map(nav=>nav.outerHTML));
 assert.equal(templates,count,'TOC rendering never constructs unrelated full-document DOM');
 clear(owner);
}
console.log('PASS TOC matches full rendering across duplicate/reference/nested/setext/fenced/CRLF headings and both themes');
let renders=0;
globalThis.fragmentRender=async(s,options)=>{renders++;return `<p data-line="1">${s}-${options.theme}</p>`;};
assert.match(await fragment('[toc]','theme-test',1,light,owner),/theme-test-light/);
assert.match(await fragment('[toc]','theme-test',1,dark,owner),/theme-test-dark/);assert.equal(renders,2);
await fragment('[toc]','theme-test',1,dark,owner);assert.equal(renders,2);
clear({});await fragment('[toc]','theme-test',1,dark,owner);assert.equal(renders,2,'unrelated editor disposal retains live owner');
clear(owner);await fragment('[toc]','theme-test',1,dark,owner);assert.equal(renders,3,'owner disposal releases full context');
console.log('PASS theme invalidation and owner cleanup');
let attempts=0;
globalThis.fragmentRender=async()=>{if(++attempts===1)throw new Error('temporary render failure');return '<p data-line="1">recovered</p>';};
await assert.rejects(fragment('[toc]','retry-test',1,light,owner),/temporary render failure/);
assert.match(await fragment('[toc]','retry-test',1,light,owner),/recovered/);assert.equal(attempts,2);
console.log('PASS rejected context is retryable');
const pending=new Map();renders=0;
globalThis.fragmentRender=(s,options)=>{renders++;return new Promise((resolve,reject)=>pending.set(s+options.theme,{resolve,reject}));};
const older=fragment('[toc]','old',1,light,owner), newer=fragment('[toc]','new',1,dark,owner);
await new Promise(resolve=>setImmediate(resolve));pending.get('newdark').resolve('<p data-line="1">new-dark</p>');assert.match(await newer,/new-dark/);
pending.get('oldlight').resolve('<p data-line="1">old-light</p>');assert.match(await older,/old-light/);
assert.match(await fragment('[toc]','new',1,dark,owner),/new-dark/);assert.equal(renders,2);
const rejected=fragment('[toc]','reject-old',1,light,owner);const failure=assert.rejects(rejected,/old failure/);
const current=fragment('[toc]','current',1,dark,owner);await new Promise(resolve=>setImmediate(resolve));pending.get('currentdark').resolve('<p data-line="1">current</p>');await current;
pending.get('reject-oldlight').reject(new Error('old failure'));await failure;
await fragment('[toc]','current',1,dark,owner);assert.equal(renders,4,'late rejection must not clear newer cache');
console.log('PASS out-of-order source/theme results and old rejection preserve current cache');
clear(owner);
const tocPending=[];
globalThis.fragmentTocs=(source,options)=>new Promise((resolve,reject)=>tocPending.push({source,options,resolve,reject}));
const oldToc=fragment('[toc]','same-toc',1,light,owner);
const sharedToc=fragment('[toc]','same-toc',1,light,owner);assert.equal(tocPending.length,1);
clear(owner);
const freshToc=fragment('[toc]','same-toc',1,light,owner);assert.equal(tocPending.length,2);
tocPending[1].resolve(new Map([[1,'<nav>fresh</nav>']]));assert.equal(await freshToc,'<nav>fresh</nav>');
tocPending[0].resolve(new Map([[1,'<nav>old</nav>']]));assert.equal(await oldToc,'<nav>old</nav>');assert.equal(await sharedToc,'<nav>old</nav>');
assert.equal(await fragment('[toc]','same-toc',1,light,owner),'<nav>fresh</nav>');assert.equal(tocPending.length,2,'released pending TOC cannot replace the current context');
const failedToc=fragment('[toc]','reject-toc',1,light,owner);const rejectedToc=assert.rejects(failedToc,/retry toc/);
tocPending[2].reject(new Error('retry toc'));await rejectedToc;
const recoveredToc=fragment('[toc]','reject-toc',1,light,owner);assert.equal(tocPending.length,4);
tocPending[3].resolve(new Map([[1,'<nav>recovered</nav>']]));assert.equal(await recoveredToc,'<nav>recovered</nav>');
console.log('PASS TOC request coalescing, owner release during pending work and rejection retry');
clear(owner);delete globalThis.fragmentRender;delete globalThis.fragmentActual;delete globalThis.fragmentTocs;dom.window.close();
console.log('6 fragment context regression groups passed');

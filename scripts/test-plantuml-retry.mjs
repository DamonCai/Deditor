import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const dom=new JSDOM('<body>',{url:'https://fixture.invalid'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const out=path.resolve('node_modules/.cache/plantuml-retry.mjs');
await build({entryPoints:['src/lib/plantumlHydrate.ts'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {hydratePlantuml}=await import(pathToFileURL(out));
const actualFetch=globalThis.fetch;
const root=document.createElement('div');
root.innerHTML='<div class="plantuml-diagram" data-plantuml-encoded="retry-fixture" data-plantuml-source="Alice -> Bob"></div>';
const el=root.firstElementChild;let calls=0;
try {
 globalThis.fetch=async (_url,{signal})=>{calls++;if(calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));return new Response('<svg xmlns="http://www.w3.org/2000/svg"><text>Recovered</text></svg>');};
 await hydratePlantuml(root).done;
 assert.ok(el.classList.contains('error'));assert.equal(el.querySelector('pre').textContent,'Alice -> Bob');
 await hydratePlantuml(root).done;
 assert.equal(calls,2,'same placeholder must issue a retry after timeout');
 assert.equal(el.querySelector('svg text')?.textContent,'Recovered');assert.ok(!el.classList.contains('error'));
 await hydratePlantuml(root).done;assert.equal(calls,2,'successful hydration stays cached');
 console.log('PASS actual 5s timeout timer, preserved source, same-node retry, cleared error and success cache');
} finally {globalThis.fetch=actualFetch;dom.window.close();}

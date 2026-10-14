import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import * as document from '../src/lib/xmind/document';
import * as edit from '../src/lib/xmind/edit';
import * as scene from '../src/lib/xmind/scene';

// Optional frozen pre-optimization source tree; identical synthetic bytes and
// operation order are used for both versions. No user documents are read.
const baselineRoot=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
const implementations: {name:string;root:string;document:typeof document;edit:typeof edit;scene:typeof scene}[]=[];
if(baselineRoot) implementations.push({name:'before',root:resolve(baselineRoot),
  document:await import(pathToFileURL(resolve(baselineRoot,'src/lib/xmind/document.ts')).href),
  edit:await import(pathToFileURL(resolve(baselineRoot,'src/lib/xmind/edit.ts')).href),
  scene:await import(pathToFileURL(resolve(baselineRoot,'src/lib/xmind/scene.ts')).href)});
implementations.push({name:'after',root:process.cwd(),document,edit,scene});
const median=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const timed=<T>(fn:()=>T)=>{const values:number[]=[];let result:T;for(let i=0;i<6;i++){const start=performance.now();result=fn();if(i)values.push(performance.now()-start);}return {result:result!,median_ms:median(values),samples_ms:values};};
let seed=0x12345678;
const attachment=new Uint8Array(8*1024*1024);
for(let i=0;i<attachment.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;attachment[i]=seed&255;}
const results=[];
for(const [count,assetBytes] of [[1000,0],[5000,0],[1000,attachment.length]]) {
  const sheets:document.Sheet[]=[{id:'s',title:'Synthetic benchmark',rootTopic:{id:'root',title:'Root',children:{attached:Array.from({length:count},(_,i)=>({id:'n'+i,title:'Topic '+i}))}}}];
  const bytes=zipSync({'content.json':strToU8(JSON.stringify(sheets)),...(assetBytes?{'resources/blob.bin':attachment}:{})});
  let referenceUrl:string|undefined;
  for(const impl of implementations){
    const doc=impl.document.openDocument(bytes);
    const title=timed(()=>impl.document.editDocument(doc.sheets,'s',{type:'title',id:'n500',title:'Updated'}));
    const archive=timed(()=>impl.document.writeDocument(doc,title.result));
    const base64=timed(()=>impl.edit.bytesToXmindDataUrl(archive.result));
    if(referenceUrl)assert.equal(base64.result,referenceUrl);else referenceUrl=base64.result;
    assert.deepEqual(new Uint8Array(Buffer.from(base64.result.split(',')[1],'base64')),archive.result);
    const layout=timed(()=>impl.scene.buildScene(title.result[0]));
    const painted=impl.document.editDocument(title.result,'s',{type:'properties',id:'n500',properties:{'svg:fill':'#123456'}});
    const builder=impl.scene.createSceneBuilder?.()??impl.scene.buildScene;
    builder(title.result[0]);
    let toggle=false;
    const appearance=timed(()=>builder((toggle=!toggle)?painted[0]:title.result[0]));
    assert.deepEqual(appearance.result,impl.scene.buildScene(toggle?painted[0]:title.result[0]));
    assert.equal(layout.result.nodes.length,count+1);
    const stages=Object.fromEntries(Object.entries({title,archive,base64,layout,appearance}).map(([key,{median_ms,samples_ms}])=>[key,{median_ms,samples_ms}]));
    results.push({implementation:impl.name,nodes:count+1,assetBytes,archiveBytes:archive.result.length,stages});
  }
}
console.log(JSON.stringify({runtime:process.version,platform:process.platform,sourceHashes:implementations.map(impl=>({name:impl.name,files:Object.fromEntries(['document','edit','scene'].map(name=>[name,createHash('sha256').update(readFileSync(resolve(impl.root,`src/lib/xmind/${name}.ts`))).digest('hex')]))})),results},null,2));

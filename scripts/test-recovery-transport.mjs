import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'deditor-recovery-transport-'));
const perf = process.argv.includes('--perf');
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
let child;
try {
  await build({entryPoints:['src/lib/recoveryTransport.ts'],outfile:path.join(scratch,'encoder.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const {RecoveryEncoder,captureRecoverySnapshot} = await import(pathToFileURL(path.join(scratch,'encoder.mjs')));
  fs.mkdirSync(path.join(scratch,'src'));
  fs.writeFileSync(path.join(scratch,'Cargo.toml'), '[package]\nname="deditor-recovery-probe"\nversion="0.0.0"\nedition="2021"\n[dependencies]\nserde={version="1",features=["derive"]}\nserde_json={version="1",features=["raw_value"]}\nlog="0.4"\n');
  const modules = ['markdown_history','markdown_state','recovery_transport'].map(name=>`#[path=${JSON.stringify(path.resolve('src-tauri/src',name+'.rs'))}] mod ${name};`).join('\n');
  fs.writeFileSync(path.join(scratch,'src/main.rs'), `#![allow(dead_code)]
${modules}
use std::{fs,io::{self,BufRead,Write},path::PathBuf,time::Instant};
fn main() {
 let root=PathBuf::from(std::env::args().nth(1).unwrap());
 let mut recovery=recovery_transport::Recovery::default();
 for line in io::stdin().lock().lines() {
  let req:serde_json::Value=serde_json::from_str(&line.unwrap()).unwrap();
  let state=root.join("state.json");
  if req["reset"]==true {recovery=recovery_transport::Recovery::default();}
  if req["fail"]==true {fs::create_dir_all(state.with_extension("json.tmp")).unwrap();}
  let begin=Instant::now();
  let result=if let Some(source)=req["legacy"].as_str() { markdown_state::write(&state,source).map(|_|true) }
   else {recovery.write(&state,serde_json::from_value(req["packet"].clone()).unwrap())};
  let elapsed=begin.elapsed().as_secs_f64()*1000.0;
  if req["fail"]==true {fs::remove_dir(state.with_extension("json.tmp")).unwrap();}
  let content=if req["echo"]==true {fs::read_to_string(&state).unwrap_or_default()} else {String::new()};
  println!("{}",serde_json::json!({"ok":result.as_ref().ok(),"error":result.err(),"ms":elapsed,"content":content}));
  io::stdout().flush().unwrap();
 }
}
`);
  const target=path.resolve('src-tauri/target/recovery-probe');
  const compile=spawnSync('cargo',['build','--quiet','--release','--manifest-path',path.join(scratch,'Cargo.toml'),'--target-dir',target],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  child=spawn(path.join(target,'release/deditor-recovery-probe'),[path.join(scratch,'data')],{stdio:['pipe','pipe','inherit']});
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
  async function send(request) {child.stdin.write(JSON.stringify(request)+'\n');const line=await lines.next();assert(!line.done,'Rust receiver exited');return JSON.parse(line.value);}
  const encoder=new RecoveryEncoder('test-session');
  const long='中文\\"\n'.repeat(120)+'😀尾';
  let snapshot={v:3,tabs:[{recoveryId:'a',filePath:'self-created.md',content:long,savedContent:'old'},{recoveryId:'b',filePath:null,content:'second',savedContent:''}],theme:'light',extra:{unknown:[1,true]}};
  let checks=0;
  async function check(value,options={}) {
    let prepared=encoder.prepare(value);
    let result=await send({packet:prepared.packet,echo:true,...options});
    if (result.ok===false) {prepared=encoder.prepare(value,true);result=await send({packet:prepared.packet,echo:true});}
    assert.equal(result.error,null);assert.equal(result.ok,true);
    assert.deepEqual(JSON.parse(result.content),value);prepared.acknowledge();checks++;
    return prepared.packet;
  }
  const mutable={tabs:[{recoveryId:'capture',content:long,savedContent:''}],settings:{value:'captured'}};
  const frozen=JSON.parse(JSON.stringify(mutable));
  const captured=captureRecoverySnapshot(mutable);
  mutable.tabs[0].content='later';mutable.settings.value='later';
  const preparedCapture=encoder.prepareCaptured(captured);
  const capturedResult=await send({packet:preparedCapture.packet,echo:true});
  assert.deepEqual(JSON.parse(capturedResult.content),frozen);preparedCapture.acknowledge();
  await check(snapshot);
  for (let i=0;i<96;i++) {
    const tab=snapshot.tabs[0],offset=[0,Math.floor(tab.content.length/2),tab.content.length][i%3];
    const inserted=['你好','\n','"\\','😀','😁','\ud800','\udc00',''][i%8];
    snapshot={...snapshot,tabs:[{...tab,content:tab.content.slice(0,offset)+inserted+tab.content.slice(offset+(i%5===0?1:0))},snapshot.tabs[1]]};
    await check(snapshot);
  }
  for(const content of ['A'.repeat(80)+'😀','A'.repeat(80)+'😁','A'.repeat(80)+'\ud83d','A'.repeat(80)+'\ud83d\ude01','',long]) {
    snapshot={...snapshot,tabs:[{...snapshot.tabs[0],content},snapshot.tabs[1]]};await check(snapshot);
  }
  snapshot={...snapshot,tabs:[...snapshot.tabs].reverse(),theme:'dark'};
  const reordered=await check(snapshot);assert(reordered.texts.every(t=>t.value===undefined),'tab reorder reuses text');
  snapshot={...snapshot,tabs:snapshot.tabs.slice(0,1)};await check(snapshot);
  await check(snapshot,{reset:true});
  // The disk may succeed but its acknowledgement may be lost in transit.
  const lost=encoder.prepare(snapshot);assert.equal((await send({packet:lost.packet})).ok,true);
  await check(snapshot);
  const failed=encoder.prepare({...snapshot,theme:'failed'});
  const failure=await send({packet:failed.packet,fail:true,echo:true});assert(failure.error);assert.deepEqual(JSON.parse(failure.content),snapshot);
  await check({...snapshot,theme:'retry'});
  await check({...snapshot,tabs:[]});
  await check({tabs:[]});
  // Do not interpret metadata or document strings as protocol delimiters.
  await check({tabs:[{content:'\ud800'.repeat(60)+'😀',savedContent:'\udc00',recoveryId:'same',filePath:'\ud800'},{content:'other',savedContent:'',recoveryId:'same'}],unknown:'\udc00'});
  console.log(`PASS ${checks} frontend -> actual Rust -> atomic file snapshots: CJK, CR/escape/emoji/surrogates, reorder, deletion, stale cache, lost ACK, failed write/retry, empty and duplicate IDs`);
  if(perf) {
    for(const count of [1,10]) {
      const source=('正文 original line "quoted" \\ slash 😀\r\n').repeat(24000);
      const initial={v:3,tabs:Array.from({length:count},(_,i)=>({recoveryId:'bench-'+i,filePath:'generated-'+i+'.md',content:source,savedContent:source+'baseline'})),theme:'light'};
      const enc=new RecoveryEncoder('bench-'+count);
      const coldStart=performance.now();const coldLegacy=JSON.stringify({content:JSON.stringify(initial)});const coldBefore=performance.now()-coldStart;
      const coldNext=performance.now();const first=enc.prepare(initial,true);JSON.stringify({packet:first.packet});const coldAfter=performance.now()-coldNext;
      const coldNativeBefore=await send({legacy:JSON.stringify(initial)});const coldNativeAfter=await send({packet:first.packet});first.acknowledge();
      const cachedTextBytes=first.packet.texts.reduce((bytes,text)=>bytes+Buffer.byteLength(text.value),0);
      const before=[],after=[],nativeBefore=[],nativeAfter=[],bytesBefore=[],bytesAfter=[];
      let current=initial;
      for(let i=0;i<15;i++) {
        // Alternate text edits and view-only changes; other dirty tabs stay open.
        current={...current,theme:i%2?'dark':'light',tabs:current.tabs.map((tab,index)=>index===0?{...tab,content:tab.content+'x'}:tab)};
        let start=performance.now();const legacy=JSON.stringify(current);const wire=JSON.stringify({content:legacy});before.push(performance.now()-start);bytesBefore.push(Buffer.byteLength(wire));
        start=performance.now();const prepared=enc.prepare(current);const packetWire=JSON.stringify({packet:prepared.packet});after.push(performance.now()-start);bytesAfter.push(Buffer.byteLength(packetWire));
        let old,newer;
        if(i%2){newer=await send({packet:prepared.packet});old=await send({legacy});}
        else {old=await send({legacy});newer=await send({packet:prepared.packet});}
        assert.equal(newer.ok,true);prepared.acknowledge();
        nativeBefore.push(old.ms);nativeAfter.push(newer.ms);
      }
      assert(median(bytesAfter)<median(bytesBefore)*0.01);
      assert(median(after)<median(before),'incremental frontend prep faster');
      console.log(JSON.stringify({tabs:count,charsPerTab:source.length,coldBeforeMs:coldBefore,coldAfterMs:coldAfter,coldNativeBeforeMs:coldNativeBefore.ms,coldNativeAfterMs:coldNativeAfter.ms,cachedTextBytes,frontendBeforeMs:median(before),frontendAfterMs:median(after),ipcBeforeBytes:median(bytesBefore),ipcAfterBytes:median(bytesAfter),nativeBeforeMs:median(nativeBefore),nativeAfterMs:median(nativeAfter)}));
    }
  }
} finally {
  child?.stdin.end();
  if(child) await new Promise(resolve=>child.once('exit',resolve));
  fs.rmSync(scratch,{recursive:true,force:true});
}

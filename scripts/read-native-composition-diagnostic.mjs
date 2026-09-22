import fs from 'node:fs';
const path=process.argv[2]??'tests/artifacts/native-composition-diagnostic-2026-09-22/events.json';
const log=JSON.parse(fs.readFileSync(path,'utf8'));
const captures=log.records.filter(row=>row.kind==='event:capture');
const counts={};for(const row of captures)counts[row.data.type]=(counts[row.data.type]??0)+1;
const timeline=captures.map(({seq,time,data:d})=>({seq,time,type:d.type,trusted:d.trusted,key:d.key,code:d.code,keyCode:d.keyCode,meta:d.meta,ctrl:d.ctrl,alt:d.alt,shift:d.shift,composing:d.composing,inputType:d.inputType,data:d.data,
 surface:d.state.class||d.state.tag,selection:d.state.selection,
 cursorText:d.state.text.match(/Cursor target:[\s\S]*?(?=Scroll target:|$)/)?.[0]?.slice(0,160),
 scrollText:d.state.text.match(/Scroll target:[\s\S]*?(?=Paragraph 01:|$)/)?.[0]?.slice(0,160),
 scroll:d.state.scroll.filter(s=>s.class.includes('md-visual-scroll')).map(s=>({top:s.top,height:s.height})),
}));
console.log(JSON.stringify({path,records:log.records.length,stopped:log.stopped,counts,timeline},null,2));

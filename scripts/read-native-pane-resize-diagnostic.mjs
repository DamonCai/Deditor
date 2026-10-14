import fs from 'node:fs';
const path=process.argv[2]??'tests/artifacts/native-pane-resize-2026-09-22/events.json';
const {records}=JSON.parse(fs.readFileSync(path,'utf8'));
const downs=records.filter(r=>r.kind==='event:capture'&&r.data.type==='pointerdown');
const results=downs.map((down,index)=>{
 const next=downs[index+1]?.seq??Infinity;
 const gesture=records.filter(r=>r.seq>=down.seq&&r.seq<next);
 const events=gesture.filter(r=>r.kind==='event:capture').map(r=>r.data);
 const moves=events.filter(r=>r.type==='pointermove');
 const captures=gesture.filter(r=>r.kind.startsWith('capture-')||r.kind==='event:capture'&&/capture/.test(r.data.type));
 const final=gesture.filter(r=>r.kind.startsWith('geometry:')||r.kind==='event:after').at(-1);
 return {seq:down.seq,down:down.data,moves:moves.length,firstMove:moves[0],lastMove:moves.at(-1),missingLeftButton:moves.filter(r=>!(r.buttons&1)).map(r=>({clientX:r.clientX,buttons:r.buttons})),captures,final:final?.data};
});
console.log(JSON.stringify({log:path,records:records.length,latestGeometry:records.filter(r=>r.kind.startsWith('geometry:')).at(-1),gestures:results,mouseOnlyDowns:records.filter(r=>r.kind==='event:capture'&&r.data.type==='mousedown').length},null,2));

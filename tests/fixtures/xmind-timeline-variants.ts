import type { Sheet } from "../../src/lib/xmind/document";
import { round6Sheets } from "./xmind-round6";

export function timelineVariantSheets(varyDetails=false): Sheet[] {
  const base=round6Sheets().find(s=>s.rootTopic.structureClass==='org.xmind.ui.timeline.through.vertical')!;
  return [
    ['vertical-up','org.xmind.ui.timeline.through.vertical.btt','向上穿轴时间轴'],
    ['symmetric-down','org.xmind.ui.timeline.through.symmetric.vertical','对称垂直时间轴'],
    ['symmetric-up','org.xmind.ui.timeline.through.symmetric.vertical.btt','向上对称时间轴'],
  ].map(([id,structure,title])=>{
    if(varyDetails)id='count-'+id;
    const sheet=structuredClone(base);
    sheet.id=id;sheet.title=title;sheet.rootTopic.id=id+'-root';sheet.rootTopic.title=title;
    sheet.rootTopic.structureClass=structure;
    sheet.rootTopic.children!.attached=Array.from({length:5},(_,i)=>({
      id:id+'-main-'+i,title:'阶段 '+(i+1),children:{attached:Array.from({length:varyDetails?i+1:2},(_,j)=>({
        id:id+'-detail-'+i+'-'+j,title:'明细 '+(i+1)+' '+String.fromCharCode(65+j),
      }))},
    }));
    return sheet;
  });
}

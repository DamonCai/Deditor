import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleArchive } from '../tests/fixtures/xmind';
import { round6Sheets } from '../tests/fixtures/xmind-round6';
import type { Sheet } from '../src/lib/xmind/document';

const directory=process.argv[2]??'tests/artifacts/xmind-round14';
mkdirSync(directory,{recursive:true});
const base=round6Sheets().find(sheet=>sheet.rootTopic.structureClass==='org.xmind.ui.timeline.sided.horizontal.rtl')!;
for(const variant of ['basic','grouped','folded']) {
  const sheet=JSON.parse(JSON.stringify(base).replaceAll('sided-left',`reverse-${variant}`)) as Sheet;
  sheet.title=`反向离轴 ${variant}`;
  const children=sheet.rootTopic.children!.attached!;
  if(variant!=='basic') {
    children[0].children!.attached![0].title='长标题与多层分支：中文 English '.repeat(8);
    children[1].structureClass='org.xmind.ui.org-chart.down';
    sheet.rootTopic.boundaries=[{id:`reverse-${variant}-boundary`,range:'(0,1)',title:'前两阶段'}];
    children[2].boundaries=[{id:`reverse-${variant}-nested`,range:'(0,1)',title:'明细边界'}];
    sheet.relationships=[{id:`reverse-${variant}-relation`,end1Id:children[0].id,end2Id:children[3].id,title:'跨阶段\n联系',
      style:{properties:{'shape-class':'org.xmind.relationshipShape.curved','arrow-end-class':'org.xmind.arrowShape.triangle'}}}];
  }
  if(variant==='folded')children[0].branch='folded';
  const file=join(directory,`reverse-${variant}.xmind`);
  writeFileSync(file,sampleArchive([sheet]),{flag:'wx'});
  console.log(file);
}

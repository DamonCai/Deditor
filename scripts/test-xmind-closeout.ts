import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { closeoutSheets } from '../tests/fixtures/xmind-closeout';
import { sampleArchive, sampleSheets } from '../tests/fixtures/xmind';
import { buildScene, createSceneBuilder, edgePath } from '../src/lib/xmind/scene';
import { editDocument, openDocument, writeDocument, type Command } from '../src/lib/xmind/document';

const output='tests/artifacts/xmind-closeout-20260922';
mkdirSync(output,{recursive:true});
const sheets=closeoutSheets();
for(const sheet of sheets)writeFileSync(`${output}/${sheet.id}.xmind`,sampleArchive([sheet]));
writeFileSync(`${output}/all.xmind`,sampleArchive(sheets));
// The filled root hides an embedded stem; a transparent root must never let
// that stem run through its label on either side of an unbalanced map.
const fills=['none','transparent','#1230','#12345600','#1238','#12345680','rgba(1, 2, 3, 0)','rgb(1 2 3 / 50%)','#123','#123456','#123f','#123456ff','rgb(1,2,3)','rgba(1,2,3,1)'];
let transparentBranches=0;
for(const structure of ['org.xmind.ui.map.unbalanced','org.xmind.ui.logic.left','org.xmind.ui.logic.right','org.xmind.ui.org-chart.up','org.xmind.ui.org-chart.down'])for(const [index,fill] of fills.entries()) {
  const transparent=index<8;
  const sheet=sampleSheets()[0];
  sheet.rootTopic.structureClass=structure;
  sheet.rootTopic.style={properties:fill==='none'?{'fill-pattern':'none'}:{'svg:fill':fill}};
  const scene=buildScene(sheet),root=scene.nodes[0];
  for(const edge of scene.edges.filter(edge=>edge.from===root.topic.id && !edge.callout)) {
    const target=scene.nodes.find(node=>node.topic.id===edge.to)!;
    const path=edgePath(edge,root,target),start=path.match(/^M([^,]+),([^ ]+)/)!;
    const side=edge.direction==='left'?root.x:root.x+root.width;
    if(edge.direction==='up'||edge.direction==='down') {
      assert.equal(Number(start[2]),edge.direction==='up'?root.y:root.y+root.height,'vertical stem starts outside title');
    } else if(transparent||root.direction!=='side')assert.equal(Number(start[1]),side,'transparent central branch crosses the label');
    else assert.ok(Number(start[1])>root.x && Number(start[1])<root.x+root.width,'filled branch appearance must remain unchanged');
    transparentBranches++;
  }
}
let combinations=0;
for(const sheet of sheets.slice(4)) for(const width of [40,150,300]) for(const font of [9,18,40,64]) {
  const changed=structuredClone(sheet);
  for(const topic of changed.rootTopic.children!.detached!) {
    Object.assign(topic.style!.properties!,{'fo:max-width':String(width),'fo:font-size':String(font)});
  }
  const before=JSON.stringify(changed),scene=buildScene(changed);
  assert.equal(JSON.stringify(changed),before,'layout must not rewrite raw theme/style fields');
  assert.equal(scene.warnings.length,0);
  for(const node of scene.nodes.slice(1)) {
    for(const value of [node.x,node.y,node.width,node.height])assert.ok(Number.isFinite(value));
    const c=node.content;
    for(const x of [c.x,c.x+c.width])for(const y of [c.y,c.y+c.height]) {
      assert.ok(x>=0 && x<=node.width && y>=0 && y<=node.height,'content exceeds box');
      if(node.shape.endsWith('circle.compact'))assert.ok(Math.hypot(x-node.width/2,y-node.height/2)<=node.width/2,'circle clips combined content');
      if(node.shape.endsWith('diamond'))assert.ok(Math.abs(x-node.width/2)/(node.width/2)+Math.abs(y-node.height/2)/(node.height/2)<=1,'diamond clips combined content');
    }
    assert.ok(node.labels.every(label=>label.y>=node.height),'labels must remain outside shape');
    combinations++;
  }
}
const source=sampleArchive(sampleSheets()),doc=openDocument(source),originalEntries=unzipSync(source);
let state=doc.sheets;
const builder=createSceneBuilder(),revisions=[state],times:number[]=[];
for(let i=0;i<500;i++) {
  const command:Command=i%5===0?{type:'title',id:'root',title:`Round ${i} 中文 👨‍👩‍👧‍👦`}
    :i%5===1?{type:'properties-many',ids:['read','edit'],properties:{'svg:fill':i%2?'#AABBCC':'#334455'}}
    :i%5===2?{type:'fold',ids:['read'],folded:i%2===0}
    :i%5===3?{type:'labels',id:'edit',labels:[`Round ${i}`,'中文 👨‍👩‍👧‍👦']}
    :{type:'notes',id:'safe',text:`Note ${i}\nsecond line`};
  const start=performance.now();
  state=editDocument(state,'sheet-main',command);
  const scene=builder(state[0]);
  assert.deepEqual(scene,buildScene(state[0]),'cached layout differs after mixed command');
  const bytes=writeDocument(doc,state),reopened=openDocument(bytes);
  assert.deepEqual(reopened.sheets,state);
  const entries=unzipSync(bytes);
  for(const [name,data] of Object.entries(originalEntries))if(name!=='content.json')assert.deepEqual(entries[name],data,`resource changed: ${name}`);
  assert.deepEqual(state[1],doc.sheets[1],'other worksheet changed');
  times.push(performance.now()-start);
  revisions.push(state);
}
for(const state of revisions.slice(-51).reverse())assert.deepEqual(openDocument(writeDocument(doc,state)).sheets,state);
assert.deepEqual(writeDocument(doc,revisions[0]),source,'original revision must restore exact archive');
const report={transparentBranchCases:transparentBranches,shapeThemeCombinations:combinations,mixedOperations:500,roundtripHistoryRevisions:51,medianOperationMs:times.sort((a,b)=>a-b)[250],maxOperationMs:Math.max(...times),nativePixelParity:'not asserted',longTermMemory:'not asserted'};
writeFileSync(`${output}/core-results.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

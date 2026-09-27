import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { closeoutSheets } from '../tests/fixtures/xmind-closeout';
import { widthCloseoutSheets } from '../tests/fixtures/xmind-width-closeout';
import { sampleArchive, sampleSheets } from '../tests/fixtures/xmind';
import { buildScene, createSceneBuilder, edgePath } from '../src/lib/xmind/scene';
import { shapeSize } from '../src/lib/xmind/shapes';
import { editDocument, openDocument, writeDocument, type Command } from '../src/lib/xmind/document';

const output='tests/artifacts/xmind-closeout-20260922';
mkdirSync(output,{recursive:true});
const sheets=closeoutSheets();
// The native diamond intentionally changes branches at width === height:
// square/wide content uses 20 degrees, slightly taller content uses 45.
const squareDiamond=shapeSize('diamond',100,100),tallDiamond=shapeSize('diamond',100,100.01);
assert.ok(squareDiamond.width>370 && squareDiamond.height<140,'native square diamond uses the wide 20-degree branch');
assert.ok(Math.abs(tallDiamond.width-200.01)<1e-8 && Math.abs(tallDiamond.height-200.01)<1e-8,
  'native slightly tall diamond uses the 45-degree branch, without invented smoothing');
const canonicalWidths=widthCloseoutSheets();
const nativeAuto=buildScene(canonicalWidths[0]);
let canonicalWidthCases=0;
for (const sheet of canonicalWidths.slice(1)) {
  const original=JSON.stringify(sheet);
  const scene=buildScene(sheet);
  for (const node of scene.nodes.slice(1)) {
    const baseline=nativeAuto.nodes.find(n=>n.topic.id===node.topic.id)!;
    if (/ellipserect\.compact|diamond$/.test(node.shape)) {
      assert.deepEqual([node.width,node.height,node.lines],[baseline.width,baseline.height,baseline.lines],
        'native content-sized shape must not wrap using customWidth');
    } else if (node.topic.customWidth===150) {
      assert.notDeepEqual([node.width,node.height,node.lines],[baseline.width,baseline.height,baseline.lines],
        'native resizable shape must still respond to customWidth');
    }
    canonicalWidthCases++;
  }
  assert.equal(JSON.stringify(sheet),original,'ignored customWidth must remain in the source');
  const archive=sampleArchive([sheet]),doc=openDocument(archive);
  const edited=editDocument(doc.sheets,sheet.id,{type:'title',id:sheet.rootTopic.id,title:'Width roundtrip'});
  assert.deepEqual(openDocument(writeDocument(doc,edited)).sheets[0].rootTopic.children,sheet.rootTopic.children,
    'editing a different title must preserve canonical widths');
}
for (const shape of ['org.xmind.topicShape.ellipserect.compact','org.xmind.topicShape.diamond']) {
  const sheet=structuredClone(canonicalWidths[0]);
  const topic=sheet.rootTopic.children!.detached!.find(topic=>topic.style!.properties!['shape-class']===shape)!;
  topic.style!.properties!['fo:max-width']='60';
  const node=buildScene(sheet).nodes.find(node=>node.topic.id===topic.id)!;
  assert.ok(node.lines.length>nativeAuto.nodes.find(node=>node.topic.id===topic.id)!.lines.length,
    'legacy explicit fo:max-width rendering remains supported');
}
const canonicalCircle=buildScene(canonicalWidths[1]).nodes.find(node=>node.shape.endsWith('circle.compact'))!;
assert.deepEqual(canonicalCircle.lines.map(line=>line.trim()),['中文紧凑标题','alpha bravo charlie','delta'],
  'canonical narrow circle must reflow against its estimated outline, as the native sample does');
let circleReflowCases=0;
for (const width of [40,150,300]) for (const image of [false,true]) for (const marker of [false,true])
for (const font of [9,18,40]) for (const dark of [false,true]) {
  const sheet=structuredClone(canonicalWidths[1]);
  const topic=sheet.rootTopic.children!.detached!.find(topic=>topic.style!.properties!['shape-class'].endsWith('circle.compact'))!;
  topic.customWidth=width;
  if (!image) delete topic.image;
  if (!marker) delete topic.markers;
  topic.style!.properties!['fo:font-size']=String(font);
  sheet.style={properties:{'svg:fill':dark?'#112244':'#ffffff'}};
  const before=JSON.stringify(sheet),node=buildScene(sheet).nodes.find(node=>node.topic.id===topic.id)!;
  assert.equal(JSON.stringify(sheet),before,'circle reflow must not rewrite source width or title');
  assert.equal(node.lines.join('').replace(/\s/g,''),topic.title.replace(/\s/g,''),'circle reflow must retain every title character');
  assert.equal(node.width,node.height,'canonical circle must remain circular');
  assert.ok(Number.isFinite(node.width)&&node.width>=width);
  const c=node.content;
  for(const x of [c.x,c.x+c.width])for(const y of [c.y,c.y+c.height])
    assert.ok(Math.hypot(x-node.width/2,y-node.height/2)<=node.width/2+1e-8,'circle must contain image, title and marker columns');
  assert.ok(node.labels.every(label=>label.y>=node.height),'reflow must keep labels outside the circle');
  circleReflowCases++;
}
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
const report={canonicalWidthCases,circleReflowCases,transparentBranchCases:transparentBranches,shapeThemeCombinations:combinations,mixedOperations:500,roundtripHistoryRevisions:51,medianOperationMs:times.sort((a,b)=>a-b)[250],maxOperationMs:Math.max(...times),nativePixelParity:'not asserted',longTermMemory:'not asserted'};
writeFileSync(`${output}/core-results.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

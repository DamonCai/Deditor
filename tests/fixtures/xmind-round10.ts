import type { Sheet, Topic } from '../../src/lib/xmind/document';
import { BOUNDARY_SHAPES, SUMMARY_SHAPES } from '../../src/lib/xmind/groupShapes';

export function round10GroupSheets(): Sheet[] {
  return [false,true].map(summary=> {
    const prefix=summary?'summary-catalog':'boundary-catalog';
    const shapes=summary?[...SUMMARY_SHAPES]:[...BOUNDARY_SHAPES];
    const owners: Topic[]=shapes.map((shape,i)=> {
      const id=`${prefix}-${i}`;
      return {id,title:shape,position:{x:240+(i%3)*600,y:180+Math.floor(i/3)*460},
        structureClass:'org.xmind.ui.logic.right',
        children:{attached:[0,1,2].map(j=>({id:`${id}-member-${j}`,title:j===1?'较长的中间主题':'主题 '+(j+1)})),
          ...(summary?{summary:[{id:`${id}-topic`,title:'概要'}]}:{})},
        [summary?'summaries':'boundaries']:[{id:`${id}-group`,range:'(0,2)',
          ...(summary?{topicId:`${id}-topic`}:{title:shape}),
          style:{properties:{'shape-class':`org.xmind.${summary?'summary':'boundary'}Shape.${shape}`,
            'line-color':'#348C83','svg:fill':'#A5D5CD','line-width':'2','line-pattern':'solid'}}}],
      };
    });
    return {id:prefix,title:summary?'五种概要形状':'九种边界形状',rootTopic:{id:`${prefix}-root`,title:summary?'概要形状目录':'边界形状目录',children:{detached:owners}}};
  });
}

export function round10PolarSheets(): Sheet[] {
  const titles=['零角度 / 25%','90° / 50%','负角度 / 混合控制点','固定上下端点'];
  return [{id:'polar-controls',title:'极坐标与固定端点',rootTopic:{id:'polar-root',title:'联系控制点',children:{
    detached:titles.flatMap((_,i)=>[0,1].map(j=>({id:`polar-${i}-${j}`,title:j?'终点':'起点',
      position:{x:240+j*540,y:160+i*250},style:{properties:{'shape-class':'org.xmind.topicShape.rect'}}}))),
  }},relationships:titles.map((title,i)=>({id:`polar-relation-${i}`,title,end1Id:`polar-${i}-0`,end2Id:`polar-${i}-1`,
    controlPoints:i===2?{'0':{amount:.4,angle:-Math.PI/3},'1':{x:-100,y:80}}:
      {'0':{amount:i===1?.5:.25,angle:i===1?Math.PI/2:0},'1':{amount:.25,angle:i===1?Math.PI/2:0}},
    ...(i===3?{lineEndPoints:{'0':{x:0,y:-80},'1':{x:0,y:80}}}:{}),
    style:{properties:{'shape-class':'org.xmind.relationshipShape.curved','line-pattern':'solid','line-color':'#348C83'}},
  }))}];
}

export function round10FlexibleSheets():Sheet[] {
  return [{id:'flexible-controls',title:'手动联系折点',rootTopic:{id:'flexible-root',title:'手动路径',children:{
    detached:['curved','angled','zigzag'].flatMap((_,i)=>[0,1].map(j=>({id:`flexible-${i}-${j}`,title:j?'终点':'起点',
      position:{x:240+j*540,y:180+i*340},style:{properties:{'shape-class':'org.xmind.topicShape.rect'}}}))),
  }},relationships:['curved','angled','zigzag'].map((shape,i)=>({id:`flexible-relation-${i}`,title:shape,
    end1Id:`flexible-${i}-0`,end2Id:`flexible-${i}-1`,flexibleControlPoints:[{x:100,y:-60},{x:270,y:80},{x:450,y:-40}],
    lineEndPoints:{'0':{x:100,y:0},'1':{x:-100,y:0}},
    style:{properties:{'shape-class':`org.xmind.relationshipShape.flexible.${shape}`,'line-pattern':'solid','line-color':'#348C83'}},
  }))}];
}

export function round10NestedGroupSheets():Sheet[] {
  return ['org.xmind.ui.timeline.horizontal.rtl','org.xmind.ui.fishbone.rightHeaded'].map((structureClass,i)=>({
    id:`nested-${i}`,title:i?'右头鱼骨嵌套边界':'反向时间轴嵌套边界',rootTopic:{id:`nested-${i}-root`,title:'嵌套分组',structureClass,
      children:{attached:[0,1,2].map(j=>({id:`nested-${i}-branch-${j}`,title:`分支 ${j+1}`,structureClass:'org.xmind.ui.logic.right',
        children:{attached:[0,1,2].map(k=>({id:`nested-${i}-leaf-${j}-${k}`,title:k===1?'较长的中间主题':'短主题',
          ...(k===0?{labels:['较长标签用于验证镜像后的边界']}:{}),
        }))},boundaries:[{id:`nested-${i}-group-${j}`,range:'(0,2)',title:'内层长标题边界',style:{properties:{
          'shape-class':j===1?'org.xmind.boundaryShape.roundedPolygon':'org.xmind.boundaryShape.polygon',
          'line-width':j===1?'40':'2','line-pattern':'solid','svg:fill':'#E3F0EC','line-color':'#348C83',
        }}}],
      }))},boundaries:[{id:`nested-${i}-outer`,range:'(0,1)',title:'外层边界',style:{properties:{'shape-class':'org.xmind.boundaryShape.rect','svg:fill':'#F6F9FB'}}}],
    },
  }));
}

export function round10MasterSheets():Sheet[] {
  return [{id:'master-boundaries',title:'整个主题分支的边界',rootTopic:{id:'master-root',title:'整体边界',children:{detached:[{
    id:'whole-branch',title:'自由主题',position:{x:280,y:180},structureClass:'org.xmind.ui.logic.right',
    children:{attached:[{id:'whole-a',title:'第一个子主题'},{id:'whole-b',title:'第二个子主题'}],
      summary:[{id:'whole-summary',title:'概要主题',boundaries:[{id:'summary-master',range:'master',title:'概要的边界'}]}],
      callout:[{id:'whole-callout',title:'批注也应包含'}]},
    summaries:[{id:'whole-summary-group',range:'(0,1)',topicId:'whole-summary'}],
    boundaries:[{id:'whole-first',range:'master',title:'整个分支边界'},
      {id:'whole-children',range:'(0,1)',title:'子主题边界'},
      {id:'whole-second',range:'master',title:'最外层边界',style:{properties:{'shape-class':'org.xmind.boundaryShape.rect'}}}],
  },{id:'whole-neighbor',title:'独立自由主题',position:{x:100,y:750}}]}}}];
}

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

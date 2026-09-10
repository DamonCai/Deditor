import nativeShapes from './xmind-native-advanced-shapes.json';
import type { Sheet } from '../../src/lib/xmind/document';

export function round7ShapeSheets(): Sheet[] {
  return [{id:'round7-advanced',title:'高级形状',rootTopic:{id:'advanced-root',title:'高级形状对照',
    children:{detached:nativeShapes.map(({shape,index})=>({
      id:`advanced-${index}`,title:`中文 ${index+1}\nShape`,position:{x:240+index%4*420,y:Math.floor(index/4)*400},
      style:{properties:{'shape-class':shape,'svg:fill':'#DAEAF7','fill-pattern':'solid','fo:color':'#183A54',
        'border-line-color':'#547A94','border-line-width':'2pt','fo:font-size':'18pt'}},
    }))}},relationships:nativeShapes.slice(1).map((_,i)=>({
      id:`advanced-relation-${i}`,end1Id:`advanced-${i}`,end2Id:`advanced-${i+1}`,
      style:{properties:{'shape-class':'org.xmind.relationshipShape.straight','line-pattern':'solid'}},
    }))}];
}

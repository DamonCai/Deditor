import nativeShapes from './xmind-native-advanced-shapes.json';
import type { Sheet } from '../../src/lib/xmind/document';

export function round7ShapeSheets(): Sheet[] {
  const simple:Sheet={id:'round7-advanced',title:'高级形状',rootTopic:{id:'advanced-root',title:'高级形状对照',
    children:{detached:nativeShapes.map(({shape,index})=>({
      id:`advanced-${index}`,title:`中文 ${index+1}\nShape`,position:{x:240+index%4*420,y:Math.floor(index/4)*400},
      style:{properties:{'shape-class':shape,'svg:fill':'#DAEAF7','fill-pattern':'solid','fo:color':'#183A54',
        'border-line-color':'#547A94','border-line-width':'2pt','fo:font-size':'18pt'}},
    }))}},relationships:nativeShapes.slice(1).map((_,i)=>({
      id:`advanced-relation-${i}`,end1Id:`advanced-${i}`,end2Id:`advanced-${i+1}`,
      style:{properties:{'shape-class':'org.xmind.relationshipShape.straight','line-pattern':'solid'}},
    }))};
  const rich:Sheet={id:'round7-rich',title:'文字与附件',rootTopic:{id:'rich-root',title:'附件与文字对照',
    children:{detached:nativeShapes.map(({shape,index})=>({
      id:`rich-${index}`,title:`中文与 English ${index+1}\n第二行 Unicode ✨`,
      position:{x:450+index%4*900,y:Math.floor(index/4)*900},
      image:{src:'xap:resources/sample.svg',width:180,height:70},labels:['Alpha','中文标签'],
      markers:[{markerId:'priority-1'},{markerId:'task-done'}],notes:{plain:{content:'仅用于本轮生成样例。'}},href:'#rich-root',
      style:{properties:{'shape-class':shape,'svg:fill':'#DAEAF7','fill-pattern':'solid','fo:color':'#183A54',
        'border-line-color':'#547A94','border-line-width':'2pt','fo:font-size':'18pt',
        'fo:text-align':['left','center','right'][index%3]}},
    }))}}};
  return [simple,rich];
}

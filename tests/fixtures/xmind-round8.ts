import type { Sheet } from '../../src/lib/xmind/document';
import punctuation from './xmind-native-punctuation-shapes.json';
import flowchart from './xmind-native-flowchart-shapes.json';

export function round8ShapeSheets(): Sheet[] {
  return [['标点',punctuation],['流程图',flowchart]].map(([title,values],sheetIndex)=>({
    id:`round8-${sheetIndex}`,title:title as string,rootTopic:{id:`round8-root-${sheetIndex}`,title:title as string,
      children:{detached:(values as typeof flowchart).map(({shape,index})=>({
        id:`round8-${sheetIndex}-${index}`,title:`中文 ${index+1}\nEnglish`,position:{x:250+index%4*400,y:Math.floor(index/4)*400},
        labels:['标签',`Sample ${index+1}`],markers:[{markerId:'priority-1'}],
        style:{properties:{'shape-class':shape,'svg:fill':'#DAEAF7','fill-pattern':sheetIndex?'solid':'none',
          'fo:color':'#183A54','border-line-color':'#547A94','border-line-width':'2pt','fo:font-size':'18pt'}},
      }))}},
  }));
}

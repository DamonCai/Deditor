import type { Sheet } from '../../src/lib/xmind/document';

/** Synthetic, portable closeout samples. Never reads personal documents. */
export function closeoutSheets(): Sheet[] {
  const colors: Sheet[] = [
    ['default', {}], ['no-fill', {'fill-pattern':'none'}],
    ['no-fill-black', {'fill-pattern':'none','fo:color':'#000000'}],
    ['no-fill-white', {'fill-pattern':'none','fo:color':'#FFFFFF'}],
  ].map(([name, properties]) => ({id:`close-${name}`,title:String(name),
    rootTopic:{id:`close-root-${name}`,title:`Root ${name} 中文`,style:{properties:properties as Record<string,string>},
      children:{attached:[{id:`close-child-${name}`,title:'Child comparison'}]}}}));
  for (const dark of [false,true]) {
    const prefix=dark?'dark':'light';
    colors.push({id:`close-shapes-${prefix}`,title:`Compact ${prefix}`,
      theme:{map:{properties:{'svg:fill':dark?'#17212B':'#FFFFFF'}},
        centralTopic:{properties:{'svg:fill':'#345A80','fo:color':'inherited'}},
        floatingTopic:{properties:{'svg:fill':dark?'#38536C':'#E3EDF5','fo:color':'inherited'}}},
      rootTopic:{id:`close-shapes-root-${prefix}`,title:'Compact shape comparison',children:{detached:
        ['roundedRect','ellipserect.compact','circle.compact','diamond'].map((shape,i)=>({
          id:`close-${prefix}-${shape}`,title:'中文紧凑标题\nalpha bravo charlie delta',position:{x:300+(i%2)*500,y:Math.floor(i/2)*500},
          style:{properties:{'shape-class':`org.xmind.topicShape.${shape}`,'fo:font-size':'18pt','fo:max-width':'150'}},
          labels:['组合标签','👨‍👩‍👧‍👦'],markers:[{markerId:'priority-1'}],
          image:{src:'xap:resources/sample.svg',width:130,height:70},
        }))}}});
  }
  return colors;
}

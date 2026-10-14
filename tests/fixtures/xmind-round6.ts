import { TOPIC_SHAPES } from '../../src/lib/xmind/shapes';
import nativeTheme from './xmind-native-theme.json';
import type { Sheet, Topic } from '../../src/lib/xmind/document';

// Theme captured from a new, synthetic workbook made in the original XMind
// during this review. Every invocation creates fresh topic IDs and objects.
export function round6Sheets(): Sheet[] {
  const structures = [
    ['vertical', '垂直时间轴', 'org.xmind.ui.timeline.through.vertical'],
    ['sided', '离轴时间轴', 'org.xmind.ui.timeline.sided.horizontal'],
    ['left', '向左时间轴', 'org.xmind.ui.timeline.horizontal.rtl'],
    ['horizontal', '水平时间轴', 'org.xmind.ui.timeline.horizontal'],
    ['sided-left', '向左离轴时间轴', 'org.xmind.ui.timeline.sided.horizontal.rtl'],
  ];
  return structures.map(([id, title, structureClass]) => {
    const topic = (suffix: string, title: string, children?: Topic[]): Topic => ({
      id: `${id}-${suffix}`, title, ...(children ? { children: { attached: children } } : {}),
    });
    return {
      id: `round6-${id}`, title,
      theme: structuredClone(nativeTheme) as unknown as Sheet['theme'],
      rootTopic: {
        ...topic('root', '中心主题', Array.from({ length: 4 }, (_, i) =>
          topic(`main-${i}`, `分支主题 ${i + 1}`, [
            topic(`detail-${i}-a`, `明细 ${i + 1} A`),
            topic(`detail-${i}-b`, `明细 ${i + 1} B`),
          ]))),
        structureClass,
      },
    };
  });
}

export function round6StyleSheets(): Sheet[] {
  return [{id:'round6-shapes',title:'形状与联系',
    theme:structuredClone(nativeTheme) as unknown as Sheet['theme'],
    rootTopic:{id:'shapes-root',title:'自建形状样例',children:{detached:TOPIC_SHAPES.map((shape,i)=>({
      id:`shape-${i}`,title:`${shape}\n中文 ${i+1}`,position:{x:(i%3)*340+240,y:Math.floor(i/3)*300},
      style:{properties:{'shape-class':`org.xmind.topicShape.${shape}`,'svg:fill':'#D6EAF8','fo:color':'#183A54','border-line-width':'2pt','border-line-color':'#547A94','border-line-pattern':i%2?'dash':'solid','fo:text-align':i%3===0?'left':i%3===1?'center':'right'}},
      ...(i%3===0?{notes:{plain:{content:'自行生成的备注'}},href:'#shapes-root'}:{}),
    }))}},relationships:TOPIC_SHAPES.slice(1).map((_,i)=>({id:`shapes-rel-${i}`,end1Id:`shape-${i}`,end2Id:`shape-${i+1}`,style:{properties:{'shape-class':'org.xmind.relationshipShape.straight','line-pattern':'solid'}}}))
  },{id:'round6-groups',title:'分组样式',theme:structuredClone(nativeTheme) as unknown as Sheet['theme'],
    rootTopic:{id:'groups-root',title:'自建分组样例',structureClass:'org.xmind.ui.logic.right',children:{attached:Array.from({length:4},(_,i)=>({
      id:`group-main-${i}`,title:`Branch ${i+1}`,children:{attached:[0,1].map(j=>({id:`group-detail-${i}-${j}`,title:`明细 ${i+1} / ${j+1}`}))},
      boundaries:[{id:`boundary-${i}`,title:`边界 ${i+1}`,range:'(0,1)',style:{properties:{'shape-class':`org.xmind.boundaryShape.${i%2?'rect':'roundedRect'}`,'line-pattern':['solid','dash','dot','dash-dot'][i],'line-width':String(i+1),'fill-pattern':i===3?'none':'solid'}}}],
    })),summary:[{id:'group-summary',title:'概要主题'}]},summaries:[{id:'group-summary-brace',range:'(0,1)',topicId:'group-summary',style:{properties:{'line-width':'4pt','line-pattern':'dot'}}}]}
  },{id:'round6-relation-draft',title:'联系文字',rootTopic:{id:'relation-root',title:'起点',children:{detached:[{id:'relation-target',title:'终点',position:{x:300,y:0}}]}},
    relationships:[{id:'relation-draft',end1Id:'relation-root',end2Id:'relation-target',title:'可编辑联系',style:{properties:{'shape-class':'org.xmind.relationshipShape.straight'}}}]
  }];
}

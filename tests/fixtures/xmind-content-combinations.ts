import { round6Sheets } from './xmind-round6';
import { STRUCTURES } from '../../src/lib/xmind/scene';
import type { Sheet } from '../../src/lib/xmind/document';

/** Fresh synthetic media/label/icon combinations; no personal files. */
export function contentCombinationSheets(): Sheet[] {
  return STRUCTURES.map(([structureClass], index) => {
    const sheet=round6Sheets()[0];
    sheet.id=`content-combination-${index}`;
    sheet.title=structureClass.replace('org.xmind.ui.','');
    sheet.rootTopic.id=`${sheet.id}-root`;
    sheet.rootTopic.structureClass=structureClass;
    sheet.rootTopic.title='图片、标签与图标组合';
    sheet.rootTopic.children!.attached!.forEach((topic,i)=>{
      topic.id=`${sheet.id}-main-${i}`;
      topic.labels=[`标签 ${i+1}`,'中文标签需要保留完整显示并参与分支间距','Third long label'];
      topic.image={src:'xap:resources/sample.svg',width:130,height:70};
      topic.markers=[{markerId:'priority-1'},{markerId:'task-half'}];
      topic.notes={plain:{content:'自行生成的组合备注'}};
      topic.href='#'+sheet.rootTopic.id;
      topic.children!.attached!.forEach((child,j)=>{
        child.id=`${sheet.id}-detail-${i}-${j}`;
        child.labels=[`子标签 ${j+1}`,'子标签很长需要换行'];
        child.image={src:'xap:resources/sample.svg',width:90,height:60};
      });
    });
    return sheet;
  });
}

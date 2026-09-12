import type { Sheet, Topic } from "../../src/lib/xmind/document";

/** Synthetic deep media/label groups for mixed folding checks. */
export function richNestedSheet(structureClass: string, variant: number): Sheet {
 const make=(id:string,depth:number,index:number):Topic=>({id,title:depth===0?'组合布局核对':('中文 Title '+index+' ').repeat(1+(index+variant)%3),
  labels:Array.from({length:(index+variant)%7},(_,k)=>k%2?'长标签内容😀'.repeat(k+2):'Label '+k),
  ...(index%2?{image:{src:'xap:resources/sample.svg',width:90+index*10,height:60}}:{}),
  ...(depth<3?{children:{attached:Array.from({length:depth===0?4:depth===1?2+(index%2):1},(_,j)=>make(id+'-'+j,depth+1,j))}}:{}),
  ...(depth===1?{boundaries:[{id:id+'-boundary',range:'(0,1)',title:'嵌套标签分组'}]}:{}),
  style:{properties:{'fo:font-size':String(depth===0?30:14+(index+variant)%3*4)}},
 });
 const sheet:Sheet={id:structureClass+variant,title:structureClass,rootTopic:make('r',0,0)};sheet.rootTopic.structureClass=structureClass;
 return sheet;
}

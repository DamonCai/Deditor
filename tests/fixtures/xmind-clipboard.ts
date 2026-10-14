import { zipSync, strToU8 } from 'fflate';
import type { Sheet } from '../../src/lib/xmind/document';

export function clipboardArchive(kind: 'source' | 'missing' | 'collision') {
  const source=kind==='source';
  const sheet:Sheet=source?{id:'source',title:'Synthetic clipboard source',rootTopic:{id:'src-root',title:'Source',children:{attached:[
    {id:'a',title:'Picture',image:{src:'xap:resources/picture.svg',width:80,height:40},href:'#b'},
    {id:'b',title:'Target'},
  ]}},relationships:[{id:'ab',end1Id:'a',end2Id:'b',title:'Keep relation'}]}:
    {id:'target',title:'Synthetic clipboard target',rootTopic:{id:'dst-root',title:'Destination',...(kind==='collision'?{image:{src:'xap:resources/picture.svg',width:80,height:40}}:{})}};
  const files:Record<string,Uint8Array>={
    'content.json':strToU8(JSON.stringify([sheet])),
    'metadata.json':strToU8(JSON.stringify({creator:{name:'DEditor synthetic clipboard',version:'1'},dataStructureVersion:'3',layoutEngineVersion:'5'})),
  };
  if(kind!=='missing')files['resources/picture.svg']=strToU8(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40"><rect width="80" height="40" fill="${source?'#cc3344':'#3355cc'}"/><text x="8" y="25" fill="white" font-size="14">${source?'SOURCE':'TARGET'}</text></svg>`);
  files['manifest.json']=strToU8(JSON.stringify({'file-entries':Object.fromEntries(Object.keys(files).map(name=>[name,{}]))}));
  return zipSync(files);
}

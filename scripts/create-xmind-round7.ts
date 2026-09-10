import { mkdirSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { round7ShapeSheets } from '../tests/fixtures/xmind-round7';

const directory='tests/artifacts/xmind-round7';
mkdirSync(directory,{recursive:true});
const files={
  'content.json':strToU8(JSON.stringify(round7ShapeSheets())),
  'metadata.json':strToU8(JSON.stringify({creator:{name:'DEditor synthetic review',version:'7'},dataStructureVersion:'3',layoutEngineVersion:'5'})),
};
const archive=zipSync({...files,'manifest.json':strToU8(JSON.stringify({
  'file-entries':Object.fromEntries(Object.keys(files).map(name=>[name,{}])),
}))});
writeFileSync(`${directory}/advanced-shapes.xmind`,archive);
console.log(`${directory}/advanced-shapes.xmind`);

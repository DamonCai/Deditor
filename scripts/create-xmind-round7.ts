import { mkdirSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { round7ShapeSheets } from '../tests/fixtures/xmind-round7';

const directory='tests/artifacts/xmind-round7';
const name=process.argv[2] ?? 'advanced-shapes';
if(!/^[a-z0-9-]+$/.test(name))throw new Error('Use a simple fixture name');
mkdirSync(directory,{recursive:true});
const files={
  'content.json':strToU8(JSON.stringify(round7ShapeSheets())),
  'metadata.json':strToU8(JSON.stringify({creator:{name:'DEditor synthetic review',version:'7'},dataStructureVersion:'3',layoutEngineVersion:'5'})),
  'resources/sample.svg':strToU8('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="70"><rect width="180" height="70" rx="10" fill="#5385C5"/><path d="M24 35H156M90 16V54" stroke="white" stroke-width="3"/></svg>'),
};
const archive=zipSync({...files,'manifest.json':strToU8(JSON.stringify({
  'file-entries':Object.fromEntries(Object.keys(files).map(name=>[name,{}])),
}))});
writeFileSync(`${directory}/${name}.xmind`,archive);
console.log(`${directory}/${name}.xmind`);

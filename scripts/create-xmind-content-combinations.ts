import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleArchive } from '../tests/fixtures/xmind';
import { contentCombinationSheets } from '../tests/fixtures/xmind-content-combinations';
const directory=process.argv[2]??'tests/artifacts/xmind-round17';
mkdirSync(directory,{recursive:true});
for(const sheet of contentCombinationSheets()) {
  const file=join(directory,sheet.title+'.xmind');
  writeFileSync(file,sampleArchive([sheet]),{flag:'wx'});
  console.log(file);
}

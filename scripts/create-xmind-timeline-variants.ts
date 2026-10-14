import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sampleArchive } from '../tests/fixtures/xmind';
import { timelineVariantSheets } from '../tests/fixtures/xmind-timeline-variants';
const directory=process.argv[2]??'tests/artifacts/xmind-round16';
mkdirSync(directory,{recursive:true});
for(const sheet of timelineVariantSheets(process.argv.includes("--vary-details"))) {
  const file=join(directory,sheet.id+'.xmind');
  writeFileSync(file,sampleArchive([sheet]),{flag:'wx'});console.log(file);
}

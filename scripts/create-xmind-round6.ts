import { mkdirSync, writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';
import { round6Sheets, round6StyleSheets } from '../tests/fixtures/xmind-round6';

const directory = 'tests/artifacts/xmind-round6';
mkdirSync(directory, { recursive: true });
for(const [name,sheets] of [['round6-structures',round6Sheets()],['round6-styles',round6StyleSheets()]] as const) {
  const files = {
    'content.json': strToU8(JSON.stringify(sheets)),
    'metadata.json': strToU8(JSON.stringify({ creator: { name: 'DEditor synthetic review', version: '6' },dataStructureVersion:'3',layoutEngineVersion:'5' })),
  };
  writeFileSync(`${directory}/${name}.xmind`, zipSync({ ...files,
    'manifest.json': strToU8(JSON.stringify({ 'file-entries': Object.fromEntries(Object.keys(files).map(name => [name, {}])) })),
  }));
  console.log(`${directory}/${name}.xmind`);
}

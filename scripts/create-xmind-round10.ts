import { mkdirSync, writeFileSync } from 'node:fs';
import { sampleArchive } from '../tests/fixtures/xmind';
import { round10GroupSheets, round10PolarSheets } from '../tests/fixtures/xmind-round10';
const directory='tests/artifacts/xmind-round10';
mkdirSync(directory,{recursive:true});
writeFileSync(`${directory}/native-group-shapes.xmind`,sampleArchive(round10GroupSheets()));
console.log(`${directory}/native-group-shapes.xmind`);
writeFileSync(`${directory}/native-polar-controls.xmind`,sampleArchive(round10PolarSheets()));
console.log(`${directory}/native-polar-controls.xmind`);

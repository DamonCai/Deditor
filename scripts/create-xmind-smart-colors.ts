import { mkdirSync, writeFileSync } from 'node:fs';
import { sampleArchive } from '../tests/fixtures/xmind';
import { smartColorSheets } from '../tests/fixtures/xmind-smart-colors';

const directory = process.argv[2] ?? 'tests/artifacts/xmind-round11';
mkdirSync(directory, { recursive: true });
const path = `${directory}/native-smart-colors.xmind`;
// Refuse to overwrite a later native edit or original-app save.
writeFileSync(path, sampleArchive(smartColorSheets()), { flag: 'wx' });
console.log(path);

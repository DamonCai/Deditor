import { mkdirSync, writeFileSync } from 'node:fs';
import { sampleArchive } from '../tests/fixtures/xmind';
import { arrowCatalogSheets } from '../tests/fixtures/xmind-arrow-catalog';
const directory = process.argv[2] ?? 'tests/artifacts/xmind-round13';
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/arrow-catalog.xmind`, sampleArchive(arrowCatalogSheets()), { flag: 'wx' });
console.log(`${directory}/arrow-catalog.xmind`);

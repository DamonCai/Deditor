// Called after all installer post-processing. Upload each installer with its .build.json sidecar.
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
const builtAt = Number(process.env.DEDITOR_BUILD_TIME);
if (!Number.isSafeInteger(builtAt) || builtAt <= 0) throw new Error('DEDITOR_BUILD_TIME must match the time embedded by the packaging script');
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
if (process.argv.length < 3) throw new Error('Pass the final installer paths');
for (const filename of process.argv.slice(2)) {
  if (!basename(filename).startsWith(`DEditor_${version}_`) || !/\.(dmg|msi|exe)$/.test(filename)) throw new Error('Installer name must match the current package version');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  writeFileSync(`${filename}.build.json`, JSON.stringify({ version, filename: basename(filename), builtAt, sha256: hash.digest('hex'), size: statSync(filename).size }, null, 2) + '\n');
  console.log(`Update metadata: ${filename}.build.json`);
}

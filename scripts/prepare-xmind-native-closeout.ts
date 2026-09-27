import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { closeoutSheets } from '../tests/fixtures/xmind-closeout';
import { smartColorSheets } from '../tests/fixtures/xmind-smart-colors';
import { widthCloseoutSheets } from '../tests/fixtures/xmind-width-closeout';
import { sampleArchive } from '../tests/fixtures/xmind';
import { openDocument, writeDocument } from '../src/lib/xmind/document';
import { buildScene } from '../src/lib/xmind/scene';

// Single-sheet files avoid relying on the native app's tab/screenshot timing.
// These are generated samples only; this script never reads personal files.
const output = 'tests/artifacts/xmind-closeout-20260927/native-fixtures';
mkdirSync(output, { recursive: true });
const sheets = [...closeoutSheets(), ...smartColorSheets(), ...widthCloseoutSheets()];
const fixtures = sheets.map(sheet => {
  const bytes = sampleArchive([sheet]);
  const document = openDocument(bytes);
  assert.deepEqual(document.sheets, [sheet]);
  assert.deepEqual(writeDocument(document, document.sheets), bytes);
  const scene = buildScene(sheet);
  assert.equal(scene.warnings.length, 0);
  const filename = `${sheet.id}.xmind`;
  writeFileSync(`${output}/${filename}`, bytes);
  return {
    filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    title: sheet.title,
    background: scene.background,
    nodes: scene.nodes.map(node => ({
      id: node.topic.id, title: node.topic.title, shape: node.shape,
      fill: node.fill, color: node.color, fontSize: node.fontSize,
      width: node.width, height: node.height,
    })),
  };
});
writeFileSync(`${output}/manifest.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  nativeVisualParity: 'not asserted; requires paired native screenshots',
  fixtures,
}, null, 2) + '\n');
console.log(`Prepared ${fixtures.length} self-generated single-sheet fixtures at ${output}`);

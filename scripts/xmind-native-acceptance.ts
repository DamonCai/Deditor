import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { findTopic, openDocument, type Sheet } from '../src/lib/xmind/document';
import { sampleArchive, sampleSheets } from '../tests/fixtures/xmind';
import { richNestedSheet } from '../tests/fixtures/xmind-rich-nested';

// These commands prepare synthetic inputs and verify saved ZIPs. They do not
// drive the desktop or certify native UI / IME behavior.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type Case = { name: string; sheets: Sheet[]; topic: string; field: 'title' | 'labels' | 'branch'; value?: string | string[] };
const width: Sheet = {
  id: 'native-width', title: 'Default title width', rootTopic: {
    id: 'width-root', title: '标签省略与超出三行', customExtension: { keep: ['unknown', 123] },
    children: { attached: [
      { id: 'width-main', title: 'Native Review20 symmetric up', children: { attached: [{ id: 'width-detail', title: '中文标题宽度检查'.repeat(2) }] } },
      { id: 'width-words', title: 'alpha bravo charlie delta echo', style: { properties: { 'fo:max-width': '130' } } },
      { id: 'width-explicit', title: '标签省略与超出三行', style: { properties: { 'fo:max-width': '130' } } },
    ] },
  },
};
const cases: Case[] = [
  { name: 'title', sheets: [width], topic: 'width-main', field: 'title', value: 'Native acceptance title saved' },
  { name: 'ime', sheets: [structuredClone(width)], topic: 'width-root', field: 'title', value: '你好世界' },
  { name: 'labels', sheets: [{ id: 'unicode-labels', title: 'Unicode labels', rootTopic: {
    id: 'unicode-root', title: 'Labels', children: { attached: ['👨‍👩‍👧‍👦', '👍🏽', '🇨🇳', 'e\u0301'].map((cluster, i) => ({
      id: `unicode-${i}`, title: `Label ${i + 1}`, labels: [cluster.repeat(30)],
    })) },
  } }], topic: 'unicode-0', field: 'labels', value: ['👨‍👩‍👧‍👦'.repeat(30) + ' Native acceptance labels'] },
  ...['leftHeaded', 'rightHeaded'].map(direction => {
    const sheet = richNestedSheet(`org.xmind.ui.fishbone.${direction}`, 1);
    for (const id of ['r-0', 'r-1-1', 'r-2', 'r-3']) findTopic(sheet.rootTopic, id)!.branch = 'folded';
    return { name: direction, sheets: [sheet], topic: 'r-3', field: 'branch' as const };
  }),
  { name: 'multisheet', sheets: sampleSheets(), topic: 'root', field: 'title', value: 'Native acceptance multisheet saved' },
];

type Manifest = { cases: { name: string; baseline: string; working: string; sha256: string; expected: string; expectedSha256: string }[] };
const [mode, directoryArg, caseName, savedArg] = process.argv.slice(2);
assert(directoryArg && ['prepare', 'check'].includes(mode), 'Usage: tsx scripts/xmind-native-acceptance.ts prepare NEW_DIRECTORY | check DIRECTORY CASE SAVED_FILE');
const directory = resolve(directoryArg);
if (mode === 'prepare') {
  // Refuse to overwrite a previous run, including any native test results.
  mkdirSync(directory);
  mkdirSync(join(directory, 'baselines'));
  mkdirSync(join(directory, 'working 中文 #'));
  mkdirSync(join(directory, 'expected'));
  const manifest: Manifest = { cases: [] };
  for (const item of cases) {
    const bytes = sampleArchive(item.sheets);
    assert.equal(openDocument(bytes).sheets.length, item.sheets.length);
    const expected = structuredClone(item.sheets);
    const topic = findTopic(expected[0].rootTopic, item.topic)!;
    assert(topic, `Missing synthetic topic ${item.topic}`);
    if (item.value === undefined) delete topic[item.field];
    else if (item.field === 'labels') topic.labels = item.value as string[];
    else topic[item.field] = item.value as string;
    const expectedBytes = Buffer.from(JSON.stringify(expected, null, 2) + '\n');
    const entry = { name: item.name, baseline: `baselines/${item.name}.xmind`, working: `working 中文 #/${item.name}.xmind`,
      sha256: hash(bytes), expected: `expected/${item.name}.json`, expectedSha256: hash(expectedBytes) };
    for (const path of [entry.baseline, entry.working]) writeFileSync(join(directory, path), bytes, { flag: 'wx' });
    writeFileSync(join(directory, entry.expected), expectedBytes, { flag: 'wx' });
    manifest.cases.push(entry);
  }
  const paths = execFileSync('git', ['ls-files', '-z', '--', 'src', 'src-tauri', 'scripts', 'tests', 'package.json', 'package-lock.json'], { cwd: root })
    .toString().split('\0').filter(Boolean);
  // Include this script and the isolated config even before their first commit.
  for (const path of ['scripts/xmind-native-acceptance.ts', 'tests/xmind-native-acceptance.conf.json']) if (!paths.includes(path)) paths.push(path);
  const source = Object.fromEntries(paths.sort().map(path => [path, hash(readFileSync(join(root, path)))]));
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, source, generatedOn: process.platform,
    nativeUI: 'NOT_RUN', chineseCandidates: 'NOT_RUN', windowsNative: 'NOT_RUN' }, null, 2) + '\n', { flag: 'wx' });
  console.log(`Prepared ${cases.length} synthetic cases in ${directory}. Native acceptance remains NOT_RUN.`);
} else {
  assert(caseName && savedArg, 'check requires CASE and SAVED_FILE');
  const manifest: Manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const entry = manifest.cases.find(item => item.name === caseName);
  assert(entry, `Unknown case ${caseName}`);
  const beforeBytes = readFileSync(join(directory, entry.baseline));
  const expectedBytes = readFileSync(join(directory, entry.expected));
  assert.equal(hash(beforeBytes), entry.sha256, 'Baseline was modified');
  assert.equal(hash(expectedBytes), entry.expectedSha256, 'Expected result was modified');
  const saved = readFileSync(resolve(savedArg));
  const before = unzipSync(beforeBytes), after = unzipSync(saved);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'ZIP entries changed');
  for (const path of Object.keys(before)) if (path !== 'content.json') assert.deepEqual(after[path], before[path], `Unexpected change in ${path}`);
  assert.deepEqual(JSON.parse(strFromU8(after['content.json'])), JSON.parse(expectedBytes.toString()), 'Saved document differs from the exact expected edit');
  console.log(JSON.stringify({ case: caseName, archive: 'PASS', sha256: hash(saved), nativeUI: 'NOT_ASSESSED', chineseCandidates: 'NOT_ASSESSED' }, null, 2));
}

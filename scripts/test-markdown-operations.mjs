import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const types = {
  input: '文字输入与替换', structure: '结构变化', selection: '光标、选区与焦点',
  clipboard: '内容搬运与格式转换', format: '格式和定向修改', embedded: '内嵌编辑器',
  history: '事务与撤销重做', lifecycle: '视图与文档生命周期',
  persistence: '保存与异常恢复', presentation: '呈现与源文保真',
};
// A suite may cover several types, but runs only once in a combined audit.
const suites = [
  ['test:markdown-startup', ['lifecycle', 'persistence']],
  ['test:markdown-visual', ['input', 'structure', 'history', 'presentation']],
  ['test:markdown-visual:integration', ['input', 'structure', 'selection', 'history', 'lifecycle', 'presentation']],
  ['test:markdown-basic', ['input', 'structure', 'history']],
  ['test:markdown-enter-history', ['input', 'structure', 'history']],
  ['test:markdown-input-clipboard', ['input', 'clipboard', 'selection', 'history']],
  ['test:markdown-table', ['input', 'structure', 'selection', 'clipboard', 'embedded', 'history', 'lifecycle', 'persistence', 'presentation']],
  ['test:markdown-format-links', ['format', 'selection', 'structure']],
  ['test:markdown-images', ['embedded', 'format', 'persistence']],
  ['test:markdown-special-blocks', ['embedded', 'selection', 'structure']],
  ['test:markdown-diagram-modes', ['embedded', 'lifecycle', 'presentation']],
  ['test:markdown-search', ['format', 'selection', 'history']],
  ['test:markdown-session', ['history', 'lifecycle', 'persistence']],
  ['test:markdown-navigation', ['selection', 'structure']],
  ['test:markdown-tasks', ['structure', 'input', 'history']],
  ['test:markdown-image-clipboard', ['clipboard', 'embedded', 'lifecycle']],
  ['test:close-persistence', ['persistence', 'lifecycle']],
  ['test:markdown-save-races', ['persistence', 'history']],
  ['test:markdown-cross-block', ['selection', 'input', 'structure', 'history']],
  ['test:markdown-block-boundary', ['embedded', 'structure', 'selection']],
  ['test:markdown-insert-lifecycle', ['embedded', 'lifecycle', 'history']],
  ['test:markdown-sequence-inline', ['input', 'format', 'history', 'selection']],
  ['test:markdown-sequence-table', ['structure', 'clipboard', 'history']],
  ['test:markdown-sequence-block', ['embedded', 'structure', 'history']],
  ['scripts/test-markdown-sequence-session.mjs', ['format', 'lifecycle', 'history']],
  ['scripts/test-markdown-mode-focus.mjs', ['lifecycle', 'selection', 'embedded']],
  ['scripts/test-markdown-boundary-audit.mjs', ['structure', 'selection', 'embedded', 'history']],
  ['scripts/test-markdown-selection-audit.mjs', ['selection', 'clipboard', 'structure']],
  ['scripts/test-markdown-mouse-audit.mjs', ['selection', 'lifecycle']],
  ['scripts/test-markdown-recovery-audit.mjs', ['persistence', 'lifecycle']],
  ['test:markdown-tabs', ['lifecycle', 'history']],
  ['test:split-right', ['lifecycle', 'history']],
  ['test:markdown-code-lines', ['presentation', 'embedded']],
  ['test:markdown-code-focus', ['presentation', 'embedded']],
];

const args = process.argv.slice(2);
const filterArg = args.find(arg => arg.startsWith('--type='));
const selected = filterArg ? filterArg.slice(7).split(',') : Object.keys(types);
if (args.some(arg => arg !== '--list' && arg !== filterArg) || selected.some(type => !types[type])) {
  console.error(`Usage: npm run test:markdown-operations -- [--list] [--type=${Object.keys(types).join(',')}]`);
  process.exit(2);
}
const planned = suites.filter(([, tags]) => tags.some(tag => selected.includes(tag)));
if (args.includes('--list')) {
  for (const type of selected) {
    console.log(`${type}: ${types[type]}`);
    for (const [script, tags] of planned) if (tags.includes(type)) console.log(`  ${script}`);
  }
  console.log(`${planned.length} unique suites; DOM/model tests do not certify native clipboard, IME, or layout.`);
  process.exit(0);
}
if (process.env.DEDITOR_TEST_FILTER) {
  console.error('Unset DEDITOR_TEST_FILTER for an auditable operation-type run. Use --type instead.');
  process.exit(2);
}
if (!process.env.npm_execpath) throw new Error('Run this entry through npm run test:markdown-operations.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.resolve('tests/artifacts/markdown-operations', stamp);
fs.mkdirSync(directory, { recursive: true });
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout?.trim() ?? '';
const report = {
  startedAt: new Date().toISOString(), gitHead: git('rev-parse', 'HEAD'),
  workingTree: git('status', '--short'), selectedTypes: selected, types,
  scope: 'Model/DOM integration; synthetic clipboard, IME and storage. Not native acceptance.',
  status: 'running', suites: planned.map(([script, tags]) => ({ script, types: tags, status: 'pending' })),
};
const writeReport = () => fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeReport();
console.log(`Operation audit: ${planned.length} suites. Logs: ${directory}`);
for (const entry of report.suites) {
  entry.status = 'running'; writeReport();
  const start = Date.now();
  entry.log = entry.script.replaceAll(':', '-').replaceAll('/', '-') + '.log';
  const logFile = path.join(directory, entry.log), fd = fs.openSync(logFile, 'w');
  console.log(`RUN ${entry.script}`);
  let result;
  try {
    const command = entry.script.startsWith('scripts/') ? [entry.script] : [process.env.npm_execpath, 'run', entry.script];
    result = spawnSync(process.execPath, command, {
      stdio: ['ignore', fd, fd], env: process.env,
    });
  } finally { fs.closeSync(fd); }
  entry.durationMs = Date.now() - start;
  entry.exitCode = result.status; entry.signal = result.signal;
  entry.status = result.status === 0 && !result.error ? 'passed' : 'failed';
  if (result.error) entry.error = String(result.error);
  const output = fs.readFileSync(logFile, 'utf8');
  entry.reportedPassLines = output.split('\n').filter(line => /^PASS\b/.test(line)).length;
  if (entry.status === 'failed') entry.failureTail = output.split('\n').slice(-45).join('\n');
  writeReport();
  console.log(`${entry.status.toUpperCase()} ${entry.script} (${(entry.durationMs / 1000).toFixed(1)}s)`);
}
report.finishedAt = new Date().toISOString();
report.status = report.suites.every(entry => entry.status === 'passed') ? 'passed' : 'failed';
report.byType = Object.fromEntries(selected.map(type => {
  const entries = report.suites.filter(entry => entry.types.includes(type));
  return [type, { passed: entries.filter(entry => entry.status === 'passed').length, total: entries.length }];
}));
writeReport();
for (const [type, result] of Object.entries(report.byType)) console.log(`${types[type]}: ${result.passed}/${result.total} suites passed`);
console.log(`Report: ${path.join(directory, 'report.json')}`);
process.exitCode = report.status === 'passed' ? 0 : 1;

import fs from 'node:fs';
import path from 'node:path';
const directory = path.resolve(process.argv[2] ?? 'tests/artifacts/native-desktop-diagnostic-2026-09-22');
const files = fs.readdirSync(directory).filter(name => name.startsWith('desktop-') && name.endsWith('.json')).sort();
if (!files.length) throw new Error('No actual native desktop observations yet');
for (const name of files) {
  const log = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
  let previous;
  const transitions = [], errors = [];
  for (const record of log.records) {
    if (record.error) errors.push(record);
    if (!record.state) continue;
    const state = record.state;
    if (Object.values(state).some(value => value && typeof value === 'object' && 'error' in value)) errors.push(record);
    const current = JSON.stringify([state.isFullscreen, state.isFocused, state.outerPosition, state.outerSize, state.innerSize, state.fileHeader]);
    if (current !== previous) {
      transitions.push({ seq: record.seq, at: record.sampleFinished, reason: record.reason, ...state });
      previous = current;
    }
  }
  console.log(JSON.stringify({ file: name, label: log.label, samples: log.records.length, errors, transitions }, null, 2));
}

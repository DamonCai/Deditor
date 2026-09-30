// Exercise the real Cargo build script and Tauri configuration merge.
// No bundles are created or registered with the OS by these checks.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localCargo = path.join(homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const cargo = existsSync(localCargo) ? localCargo : 'cargo';
const cases = [
  ['changed identifier inherits associations', { identifier: 'com.deditor.isolation-probe' }, false],
  ['changed name inherits associations', { productName: 'DEditor Isolation Probe' }, false],
  ['empty bundle object still inherits associations', { identifier: 'com.deditor.isolation-probe', bundle: {} }, false],
  ['explicit empty associations permits isolated build', { productName: 'DEditor Isolation Probe', identifier: 'com.deditor.isolation-probe', bundle: { fileAssociations: [] } }, true],
  ['explicit null removes associations', { identifier: 'com.deditor.isolation-probe', bundle: { fileAssociations: null } }, true],
  // Run last to restore Cargo's effective config to the regular product.
  ['official product retains its associations', null, true],
];
for (const [label, override, allowed] of cases) {
  const env = { ...process.env };
  delete env.TAURI_CONFIG;
  if (override) env.TAURI_CONFIG = JSON.stringify(override);
  const result = spawnSync(cargo, ['check', '--offline', '--manifest-path', 'src-tauri/Cargo.toml'], {
    cwd: root, env, encoding: 'utf8', timeout: 180_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) throw result.error;
  if (allowed) assert.equal(result.status, 0, `${label}\n${output}`);
  else {
    assert.notEqual(result.status, 0, label);
    assert.match(output, /Isolated DEditor builds must set bundle\.fileAssociations to \[\]/, `${label}\n${output}`);
  }
  console.log(`PASS ${label}`);
}

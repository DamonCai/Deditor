import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  console.log('Windows build-script checks require Windows.');
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, 'tests', 'artifacts');
mkdirSync(artifacts, { recursive: true });
const fixtureRoot = mkdtempSync(join(artifacts, 'build-win-script-'));
const hosts = ['powershell.exe'];
const pwsh = spawnSync('pwsh.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' });
if (pwsh.status === 0) hosts.push('pwsh.exe');
const manifests = {
  'package.json': '{\n  "name": "deditor",\n  "version": "1.0.3",\n  "description": "中文元数据 …",\n  "dependencies": { "sample": "^4.5.6" }\n}\n',
  'src-tauri/tauri.conf.json': '{\n  "version": "1.0.3",\n  "productName": "DEditor",\n  "description": "中文路径 …"\n}\n',
  'src-tauri/Cargo.toml': '[package]\nname = "deditor"\nversion = "1.0.3"\n# 中文注释 …\n[dependencies]\nsample = { version = "4.5.6" }\n',
};
const cases = [
  { name: 'default-version', args: '', version: '1.0.3', status: 0 },
  { name: 'gnu-version', args: '--version 2.3.4', version: '2.3.4', status: 0 },
  { name: 'invalid-argument', args: '--verison 2.3.4', version: '1.0.3', status: 1 },
  { name: 'build-failure', args: '-Version 2.3.4', version: '2.3.4', status: 7, npmStatus: 7 },
];
for (const host of hosts) {
  for (const test of cases) {
    const dir = join(fixtureRoot, `${host}-${test.name}`);
    for (const [relativePath, content] of Object.entries(manifests)) {
      mkdirSync(dirname(join(dir, relativePath)), { recursive: true });
      writeFileSync(join(dir, relativePath), content);
    }
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    mkdirSync(join(dir, 'node_modules'));
    copyFileSync(join(root, 'scripts', 'build-win.ps1'), join(dir, 'scripts', 'build-win.ps1'));
    copyFileSync(join(root, 'scripts', 'update-metadata.mjs'), join(dir, 'scripts', 'update-metadata.mjs'));
    for (const [kind, suffix] of [['msi', 'x64_en-US.msi'], ['nsis', 'x64-setup.exe']]) {
      const bundleDir = join(dir, 'src-tauri', 'target', 'release', 'bundle', kind);
      mkdirSync(bundleDir, { recursive: true });
      for (const version of ['1.0.2', test.version]) writeFileSync(join(bundleDir, `DEditor_${version}_${suffix}`), 'self-generated installer placeholder');
    }
    writeFileSync(join(dir, 'run.ps1'), `$ErrorActionPreference = 'Stop'\nfunction global:npm { $global:LASTEXITCODE = ${test.npmStatus ?? 0} }\n& (Join-Path $PSScriptRoot 'scripts/build-win.ps1') ${test.args}\nexit $LASTEXITCODE\n`);
    const result = spawnSync(host, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'run.ps1')], { encoding: 'utf8' });
    assert.equal(result.status, test.status, `${host}/${test.name}: ${result.stdout}\n${result.stderr}`);
    for (const [relativePath, original] of Object.entries(manifests)) {
      const expected = original.replace('"1.0.3"', `"${test.version}"`);
      assert.deepEqual(readFileSync(join(dir, relativePath)), Buffer.from(expected), `${host}/${test.name}: ${relativePath} UTF-8 content`);
    }
    for (const suffix of ['x64_en-US.msi', 'x64-setup.exe']) {
      assert.equal(existsSync(join(dir, 'scripts', `DEditor_${test.version}_${suffix}`)), test.status === 0, `${host}/${test.name}: current installer copy`);
      assert.equal(existsSync(join(dir, 'scripts', `DEditor_${test.version}_${suffix}.build.json`)), test.status === 0, `${host}/${test.name}: current installer metadata copy`);
      assert.equal(existsSync(join(dir, 'scripts', `DEditor_1.0.2_${suffix}.build.json`)), false, `${host}/${test.name}: no stale metadata`);
      assert.equal(existsSync(join(dir, 'scripts', `DEditor_1.0.2_${suffix}`)), false, `${host}/${test.name}: stale installer must stay in its original bundle directory`);
    }
    console.log(`PASS ${host}: ${test.name}`);
  }
}
console.log(`Build-script fixtures retained at ${fixtureRoot}`);

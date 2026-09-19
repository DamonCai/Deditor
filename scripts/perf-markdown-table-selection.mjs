import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['scripts/test-markdown-table-audit.mjs'], {
  env: { ...process.env, DEDITOR_TEST_FILTER: '^F00 selection' }, stdio: 'inherit',
});
process.exit(result.status ?? 1);

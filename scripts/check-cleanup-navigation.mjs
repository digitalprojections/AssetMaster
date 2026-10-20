import { spawnSync } from 'node:child_process';

for (const [entry, ...args] of [
  ['node_modules/tsx/dist/cli.mjs', 'tests/cleanupNavigation.test.ts'],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
]) {
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

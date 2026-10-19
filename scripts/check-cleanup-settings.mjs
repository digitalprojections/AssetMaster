import { spawnSync } from 'node:child_process';

// Repeatable focused check for session persistence and TypeScript integration.
for (const [entry, ...args] of [
  ['node_modules/tsx/dist/cli.mjs', 'tests/cleanupSession.test.ts'],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
]) {
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

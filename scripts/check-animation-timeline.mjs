import { spawnSync } from 'node:child_process';
for (const args of [
  ['node_modules/tsx/dist/cli.mjs', 'tests/animationTimelineEditing.test.ts'],
  ['node_modules/tsx/dist/cli.mjs', 'tests/animationFrameOperations.test.ts'],
  ['node_modules/tsx/dist/cli.mjs', 'tests/animationHistory.test.ts'],
  ['node_modules/typescript/bin/tsc', '--noEmit'],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

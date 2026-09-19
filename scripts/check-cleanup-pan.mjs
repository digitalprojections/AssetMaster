import { spawnSync } from 'node:child_process';
for (const args of [['tsx', 'tests/cleanupPan.test.ts'], ['tsc', '--noEmit']]) {
  const result = spawnSync(process.execPath, [args[0] === 'tsx' ? 'node_modules/tsx/dist/cli.mjs' : 'node_modules/typescript/bin/tsc', ...args.slice(1)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

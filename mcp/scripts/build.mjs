import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
await build({ entryPoints: ['src/index.ts'], outfile: 'dist/index.js', bundle: true, platform: 'node', target: 'node22', format: 'esm', sourcemap: false, legalComments: 'eof', banner: { js: "import { createRequire as __assetMasterCreateRequire } from 'node:module'; const require = __assetMasterCreateRequire(import.meta.url);" } });
await chmod('dist/index.js', 0o755);

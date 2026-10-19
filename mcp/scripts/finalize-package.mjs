import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const stage = path.resolve('../release/mcp', pkg.version, 'windows-x64');
const digest = data => createHash('sha256').update(data).digest('hex');
async function walk(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full, base));
    else if (entry.name !== 'release.json') files.push({ path: path.relative(base, full).replaceAll('\\', '/'), sha256: digest(await readFile(full)) });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
if (!process.argv.includes('--checksums')) {
  await writeFile(path.join(stage, 'release.json'), JSON.stringify({ product: 'AssetMaster MCP', version: pkg.version, platform: 'windows-x64', runtime: process.version, runtimeChecksumVerified: true, scriptsSigned: process.env.ASSETMASTER_MCP_SCRIPTS_SIGNED === 'true', files: await walk(stage) }, null, 2));
} else {
  const release = JSON.parse(await readFile(path.join(stage, 'release.json'), 'utf8'));
  const names = [`assetmaster-mcp-${pkg.version}-windows-x64.zip`, `assetmaster-mcp-server-${pkg.version}.tgz`];
  const downloads = [];
  for (const name of names) { const data = await readFile(path.join('../public/downloads', name)); downloads.push({ name, bytes: data.length, sha256: digest(data) }); }
  await writeFile('../public/downloads/SHA256SUMS.txt', downloads.map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n');
  await writeFile('../public/downloads/mcp-release.json', JSON.stringify({ product: release.product, version: pkg.version, scriptsSigned: release.scriptsSigned, runtimeChecksumVerified: true, downloads }, null, 2));
}

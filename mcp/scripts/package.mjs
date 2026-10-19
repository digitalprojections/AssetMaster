import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const output = path.resolve('../release/mcp', pkg.version);
const stage = path.join(output, 'windows-x64');
await mkdir(path.join(stage, 'dist'), { recursive: true });
await mkdir(path.join(stage, 'runtime'), { recursive: true });
await mkdir('../public/downloads', { recursive: true });
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [location, dependency] of Object.entries(lock.packages)) {
  if (!location || dependency.dev) continue;
  for (const file of await readdir(location)) {
    if (/^(license|licence|copying|notice)([.-]|$)/i.test(file)) {
      try { notices.push(`===== ${location} ${dependency.version}: ${file} =====\n${await readFile(path.join(location, file), 'utf8')}`); } catch { /* License directories are handled by their parent notice. */ }
    }
  }
}
if (!notices.length) throw new Error('Third-party licenses were not found.');
await writeFile('THIRD-PARTY-NOTICES.txt', notices.join('\n\n'));
for (const file of ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.txt']) await copyFile(file, path.join(stage, file));
await copyFile('dist/index.js', path.join(stage, 'dist/index.js'));
for (const file of ['install.ps1', 'uninstall.ps1']) await copyFile(`scripts/${file}`, path.join(stage, file));
await writeFile(path.join(stage, 'assetmaster-mcp.cmd'), '@echo off\r\n"%~dp0runtime\node.exe" "%~dp0dist\index.js" %*\r\n');
// Use an official runtime archive and validate it against Node's published SHA256 list.
const nodeVersion = process.version;
const archiveName = `node-${nodeVersion}-win-x64.zip`;
const runtimeCache = path.resolve('../release/mcp/runtime-cache');
await mkdir(runtimeCache, { recursive: true });
const runtimeArchive = path.join(runtimeCache, archiveName);
async function download(name) {
  const response = await fetch(`https://nodejs.org/dist/${nodeVersion}/${name}`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Official Node download failed: ${name} (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}
const sumsPath = path.join(runtimeCache, `SHASUMS-${nodeVersion}.txt`);
let sums;
try { sums = await readFile(sumsPath, 'utf8'); } catch { sums = (await download('SHASUMS256.txt')).toString('utf8'); await writeFile(sumsPath, sums); }
const expected = sums.split('\n').find(line => line.trim().endsWith(` ${archiveName}`))?.split(/\s+/)[0];
if (!expected) throw new Error('Official runtime checksum is unavailable.');
let archive;
try { archive = await readFile(runtimeArchive); } catch { archive = await download(archiveName); }
if (createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Node runtime checksum mismatch.');
await writeFile(runtimeArchive, archive);
const extracted = path.join(output, 'node-runtime');
execFileSync('powershell.exe', ['-NoProfile', '-File', path.resolve('scripts/extract-runtime.ps1'), '-Archive', runtimeArchive, '-Target', extracted], { windowsHide: true });
const runtimeRoot = path.join(extracted, `node-${nodeVersion}-win-x64`);
await copyFile(path.join(runtimeRoot, 'node.exe'), path.join(stage, 'runtime/node.exe'));
await copyFile(path.join(runtimeRoot, 'LICENSE'), path.join(stage, 'runtime/LICENSE'));
// Ship the bundled server without dependency installation or lifecycle scripts.
const npmStage = path.join(output, 'npm');
await mkdir(path.join(npmStage, 'dist'), { recursive: true });
for (const file of ['README.md', 'LICENSE', 'THIRD-PARTY-NOTICES.txt']) await copyFile(file, path.join(npmStage, file));
await copyFile('dist/index.js', path.join(npmStage, 'dist/index.js'));
await writeFile(path.join(npmStage, 'package.json'), JSON.stringify({ name: pkg.name, version: pkg.version, description: pkg.description, type: 'module', bin: pkg.bin, engines: pkg.engines, license: pkg.license, files: pkg.files }, null, 2));
const downloads = path.resolve('../public/downloads');
if (process.platform === 'win32') {
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  await readFile(npmCli); // Fail explicitly if this Node distribution has no npm CLI.
  execFileSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', downloads], { cwd: npmStage, windowsHide: true, stdio: 'inherit' });
} else execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', downloads], { cwd: npmStage, stdio: 'inherit' });
console.log(`Staged AssetMaster ${pkg.version}; runtime checksum verified.`);

import {existsSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const androidRoot = resolve(repoRoot, 'android');
const keyPath = resolve(androidRoot, 'assetmaster-upload-key.jks');
const propertiesPath = resolve(androidRoot, 'keystore.properties');
const onlyIfMissing = process.argv.includes('--if-missing');
const recordOnly = process.argv.includes('--record-only');

if ((existsSync(keyPath) || existsSync(propertiesPath)) && !recordOnly) {
  if (onlyIfMissing) process.exit(0);
  throw new Error('An Android upload key already exists. Refusing to overwrite it.');
}

if (recordOnly && !existsSync(keyPath)) {
  throw new Error('Cannot record Android upload-key properties because the keystore does not exist.');
}

const javaHome = process.env.JAVA_HOME || resolve(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr');
const keytool = resolve(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool');
const password = process.env.ASSETMASTER_KEY_PASSWORD || randomBytes(32).toString('base64url');
const alias = 'assetmaster-upload';

const result = recordOnly ? {status: 0} : spawnSync(keytool, [
  '-genkeypair',
  '-v',
  '-keystore', keyPath,
  '-alias', alias,
  '-keyalg', 'RSA',
  '-keysize', '4096',
  '-validity', '10000',
  '-storepass', password,
  '-keypass', password,
  '-dname', 'CN=AssetMaster Upload, OU=AssetMaster, O=Created Link, L=Tokyo, ST=Tokyo, C=JP',
], {stdio: 'inherit'});

if (result.status !== 0) {
  throw new Error(`keytool failed with exit code ${result.status}: ${result.error?.message || 'unknown process error'}`);
}

writeFileSync(propertiesPath, [
  'storeFile=assetmaster-upload-key.jks',
  `storePassword=${password}`,
  `keyAlias=${alias}`,
  `keyPassword=${password}`,
  '',
].join('\n'), {encoding: 'utf8', flag: 'wx'});

console.log(`Created local Android upload key at ${keyPath}`);

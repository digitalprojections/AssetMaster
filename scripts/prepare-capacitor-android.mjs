import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const isWindows = process.platform === 'win32';
const bin = (name) => resolve(repoRoot, 'node_modules', '.bin', `${name}${isWindows ? '.cmd' : ''}`);
const buildDebug = process.argv.includes('--build-debug');
const bundleRelease = process.argv.includes('--bundle-release');
const androidDirectory = resolve(repoRoot, 'android');
const androidStudioJavaHome = resolve(
  process.env.ProgramFiles || 'C:\\Program Files',
  'Android',
  'Android Studio',
  'jbr',
);
const androidSdkHome = resolve(
  process.env.LOCALAPPDATA || resolve(process.env.USERPROFILE || repoRoot, 'AppData', 'Local'),
  'Android',
  'Sdk',
);

const environment = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || androidStudioJavaHome,
  ANDROID_HOME: process.env.ANDROID_HOME || androidSdkHome,
  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || androidSdkHome,
};

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    shell: isWindows,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
  }
}

if (!existsSync(androidDirectory)) {
  run(bin('cap'), ['add', 'android']);
}

run(bin('vite'), ['build', '--mode', 'capacitor']);
run(bin('cap'), ['sync', 'android']);

if (buildDebug) {
  run(isWindows ? resolve(androidDirectory, 'gradlew.bat') : './gradlew', ['assembleDebug'], androidDirectory);
}

if (bundleRelease) {
  run(isWindows ? resolve(androidDirectory, 'gradlew.bat') : './gradlew', ['bundleRelease'], androidDirectory);
}

import {spawnSync} from 'node:child_process';
import {copyFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';

const sourceLogo = 'public/logos/512x512_play_store_icon.png';
const resRoot = 'android/app/src/main/res';
const iconBackgroundColor = '0x020617';
const splashBackgroundColor = '#020617';
const iconDensities = [
  ['mdpi', 48, 108, '48x48_ic_launcher.png'],
  ['hdpi', 72, 162, '72x72_ic_launcher.png'],
  ['xhdpi', 96, 216, '96x96_ic_launcher.png'],
  ['xxhdpi', 144, 324, '144x144_ic_launcher.png'],
  ['xxxhdpi', 192, 432, '192x192_ic_launcher.png'],
];
const splashAssets = [
  ['drawable/splash.png', 480, 320],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-port-xxhdpi/splash.png', 960, 1600],
  ['drawable-land-xxhdpi/splash.png', 1600, 960],
  ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
];

function runFfmpeg(args) {
  const result = spawnSync('ffmpeg.exe', ['-hide_banner', '-loglevel', 'error', ...args], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with exit code ${result.status}`);
  }
}

function copyProvidedIcon(output, sourceFileName) {
  copyFileSync(join('public/logos', sourceFileName), output);
}

function generateAdaptiveForeground(output, canvasSize) {
  const logoSize = Math.round(canvasSize * 0.54);
  runFfmpeg([
    '-y',
    '-i',
    sourceLogo,
    '-vf',
    `scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease,pad=${canvasSize}:${canvasSize}:(ow-iw)/2:(oh-ih)/2:color=${iconBackgroundColor},format=rgba`,
    '-frames:v',
    '1',
    output,
  ]);
}

function generateSplash(output, width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.24);
  runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${splashBackgroundColor}:s=${width}x${height}`,
    '-i',
    sourceLogo,
    '-filter_complex',
    `[1:v]scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2`,
    '-frames:v',
    '1',
    output,
  ]);
}

function main() {
  if (!existsSync(sourceLogo)) {
    throw new Error(`Logo not found: ${sourceLogo}`);
  }

  for (const [, , , sourceFileName] of iconDensities) {
    const path = join('public/logos', sourceFileName);
    if (!existsSync(path)) {
      throw new Error(`Launcher icon source not found: ${path}`);
    }
  }

  for (const [density, , foregroundSize, sourceFileName] of iconDensities) {
    const densityDir = join(resRoot, `mipmap-${density}`);
    copyProvidedIcon(join(densityDir, 'ic_launcher.png'), sourceFileName);
    copyProvidedIcon(join(densityDir, 'ic_launcher_round.png'), sourceFileName);
    generateAdaptiveForeground(join(densityDir, 'ic_launcher_foreground.png'), foregroundSize);
  }

  for (const [relativePath, width, height] of splashAssets) {
    generateSplash(join(resRoot, relativePath), width, height);
  }
}

main();

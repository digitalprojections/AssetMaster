import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';

const sourceLogo = 'public/logos/assetmaster-logo.png';
const resRoot = 'android/app/src/main/res';
const iconDensities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
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

function generateIcon(output, size) {
  const logoSize = Math.round(size * 0.86);
  runFfmpeg([
    '-y',
    '-i',
    sourceLogo,
    '-vf',
    `scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#020617`,
    '-frames:v',
    '1',
    output,
  ]);
}

function generateAdaptiveForeground(output, canvasSize) {
  const logoSize = Math.round(canvasSize * 0.58);
  runFfmpeg([
    '-y',
    '-i',
    sourceLogo,
    '-vf',
    `scale=${logoSize}:${logoSize}:force_original_aspect_ratio=decrease,pad=${canvasSize}:${canvasSize}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`,
    '-frames:v',
    '1',
    output,
  ]);
}

function generateSplash(output, width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.28);
  runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=#020617:s=${width}x${height}`,
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

  for (const [density, iconSize, foregroundSize] of iconDensities) {
    const densityDir = join(resRoot, `mipmap-${density}`);
    generateIcon(join(densityDir, 'ic_launcher.png'), iconSize);
    generateIcon(join(densityDir, 'ic_launcher_round.png'), iconSize);
    generateAdaptiveForeground(join(densityDir, 'ic_launcher_foreground.png'), foregroundSize);
  }

  for (const [relativePath, width, height] of splashAssets) {
    generateSplash(join(resRoot, relativePath), width, height);
  }
}

main();

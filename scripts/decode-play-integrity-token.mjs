import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {createScopedAccessToken} from './publish-play-open-testing.mjs';

export const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';

export function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    options[key] = value;
    index += 1;
  }

  for (const required of ['key', 'package']) {
    if (!options[required]) {
      throw new Error(`Missing required --${required} option.`);
    }
  }

  if (!options.token && !options.tokenFile) {
    throw new Error('Missing required --token or --tokenFile option.');
  }

  return options;
}

export function createDecodeIntegrityTokenBody(token) {
  const integrityToken = String(token || '').trim();
  if (!integrityToken) {
    throw new Error('Integrity token is required.');
  }

  return {integrityToken};
}

async function readToken(options) {
  if (options.token) {
    return options.token;
  }

  return readFile(options.tokenFile, 'utf8');
}

async function decodeIntegrityToken({key, package: packageName, token, tokenFile}) {
  const serviceAccount = JSON.parse(await readFile(key, 'utf8'));
  const accessToken = await createScopedAccessToken(serviceAccount, PLAY_INTEGRITY_SCOPE);
  const integrityToken = token || await readFile(tokenFile, 'utf8');
  const response = await fetch(
    `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createDecodeIntegrityTokenBody(integrityToken)),
    },
  );
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`Decode failed with HTTP ${response.status}: ${payload?.error?.message || text}`);
  }

  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await readToken(options);
  const result = await decodeIntegrityToken(options);
  console.log(JSON.stringify(result, null, 2));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

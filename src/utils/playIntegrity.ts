import {Capacitor, registerPlugin} from '@capacitor/core';

type EnvLike = Record<string, string | boolean | undefined>;

export type PlayIntegrityPlugin = {
  prepare(options: { cloudProjectNumber: string }): Promise<{ prepared: boolean }>;
  requestToken(options: { requestHash: string }): Promise<{ token: string }>;
};

export type PlayIntegrityConfig = {
  enabled: boolean;
  cloudProjectNumber: string;
};

const PlayIntegrity = registerPlugin<PlayIntegrityPlugin>('PlayIntegrity');

export function getPlayIntegrityConfig(env: EnvLike = import.meta.env): PlayIntegrityConfig {
  const cloudProjectNumber = String(env.VITE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER ?? '').trim();

  return {
    enabled: /^\d+$/.test(cloudProjectNumber),
    cloudProjectNumber,
  };
}

export function stableSerializeIntegrityPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(sortObjectKeys(value));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(binary, 'binary').toString('base64');

  return base64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function createPlayIntegrityRequestHash(payload: unknown): Promise<string> {
  const serialized = stableSerializeIntegrityPayload(payload);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));

  return bytesToBase64Url(new Uint8Array(digest));
}

export async function warmUpPlayIntegrity(
  platform = Capacitor.getPlatform(),
  env: EnvLike = import.meta.env,
  plugin: PlayIntegrityPlugin = PlayIntegrity,
): Promise<boolean> {
  const config = getPlayIntegrityConfig(env);
  if (platform !== 'android' || !config.enabled) {
    return false;
  }

  await plugin.prepare({cloudProjectNumber: config.cloudProjectNumber});
  return true;
}

export async function requestPlayIntegrityToken(
  payload: unknown,
  platform = Capacitor.getPlatform(),
  env: EnvLike = import.meta.env,
  plugin: PlayIntegrityPlugin = PlayIntegrity,
): Promise<{ token: string; requestHash: string } | null> {
  const config = getPlayIntegrityConfig(env);
  if (platform !== 'android' || !config.enabled) {
    return null;
  }

  const requestHash = await createPlayIntegrityRequestHash(payload);
  const response = await plugin.requestToken({requestHash});

  return {
    token: response.token,
    requestHash,
  };
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
      return result;
    }, {});
}

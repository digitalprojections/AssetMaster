import {createSign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD_BASE = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';

export function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

export function createReleaseBody({
  track = 'open',
  versionCode,
  releaseName,
  releaseNotes,
  status = 'completed',
  userFraction = undefined,
}) {
  if (!versionCode) {
    throw new Error('versionCode is required.');
  }

  const release = {
    name: releaseName || String(versionCode),
    status,
    versionCodes: [String(versionCode)],
    releaseNotes: [
      {
        language: 'en-US',
        text: releaseNotes || 'Initial Android release.',
      },
    ],
  };

  if (userFraction !== undefined) {
    release.userFraction = Number(userFraction);
  }

  return {
    track,
    releases: [release],
  };
}

export function parseArgs(argv) {
  const options = {
    mode: 'probe',
    track: 'beta',
    releaseName: '1.0',
    releaseNotes: 'Initial AssetMaster Android release.',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--publish') {
      options.mode = 'publish';
      continue;
    }

    if (arg === '--probe') {
      options.mode = 'probe';
      continue;
    }

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

  if (options.mode === 'publish' && !options.bundle && !options.versionCode) {
    throw new Error('Missing required --bundle or --versionCode option for --publish.');
  }

  return options;
}

export async function createScopedAccessToken(serviceAccount, scope = ANDROID_PUBLISHER_SCOPE) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const claim = {
    iss: serviceAccount.client_email,
    scope,
    aud: TOKEN_URL,
    exp: issuedAt + 3600,
    iat: issuedAt,
  };
  const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const assertion = `${unsignedJwt}.${signer.sign(serviceAccount.private_key, 'base64url')}`;

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Token request failed: ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

async function apiRequest({token, method = 'GET', url, body, contentType = 'application/json'}) {
  const headers = {Authorization: `Bearer ${token}`};
  const request = {method, headers};

  if (body !== undefined) {
    headers['Content-Type'] = contentType;
    request.body = contentType === 'application/json' ? JSON.stringify(body) : body;
  }

  const response = await fetch(url, request);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const reason = payload?.error?.message || text || response.statusText;
    const error = new Error(`${method} ${url} failed with HTTP ${response.status}: ${reason}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function createEdit(token, packageName) {
  return apiRequest({
    token,
    method: 'POST',
    url: `${API_BASE}/${packageName}/edits`,
    body: {},
  });
}

async function deleteEdit(token, packageName, editId) {
  await apiRequest({
    token,
    method: 'DELETE',
    url: `${API_BASE}/${packageName}/edits/${editId}`,
  });
}

async function uploadBundle({token, packageName, editId, bundlePath}) {
  const bundle = await readFile(bundlePath);
  return apiRequest({
    token,
    method: 'POST',
    url: `${UPLOAD_BASE}/${packageName}/edits/${editId}/bundles?uploadType=media`,
    body: bundle,
    contentType: 'application/octet-stream',
  });
}

async function probe({token, packageName, track = 'open'}) {
  const edit = await createEdit(token, packageName);
  try {
    const tracks = await apiRequest({
      token,
      url: `${API_BASE}/${packageName}/edits/${edit.id}/tracks`,
    });
    const selectedTrack = await getOptional(() => apiRequest({
      token,
      url: `${API_BASE}/${packageName}/edits/${edit.id}/tracks/${track}`,
    }));
    const selectedCountryAvailability = await getOptional(() => apiRequest({
      token,
      url: `${API_BASE}/${packageName}/edits/${edit.id}/countryAvailability/${track}`,
    }));
    const selectedTesters = await getOptional(() => apiRequest({
      token,
      url: `${API_BASE}/${packageName}/edits/${edit.id}/testers/${track}`,
    }));

    return {
      editId: edit.id,
      tracks: tracks.tracks?.map((track) => track.track) || [],
      track,
      selectedTrack,
      selectedCountryAvailability,
      selectedTesters,
    };
  } finally {
    await deleteEdit(token, packageName, edit.id);
  }
}

async function getOptional(loader) {
  try {
    return await loader();
  } catch (error) {
    return {
      error: error.message,
      status: error.status,
      payload: error.payload,
    };
  }
}

async function publish({
  token,
  packageName,
  bundlePath,
  versionCode: existingVersionCode,
  track,
  releaseName,
  releaseNotes,
  status,
  userFraction,
}) {
  const edit = await createEdit(token, packageName);
  let committed = false;
  try {
    const bundle = bundlePath
      ? await uploadBundle({token, packageName, editId: edit.id, bundlePath})
      : null;
    const versionCode = bundle?.versionCode || existingVersionCode;
    const trackBody = createReleaseBody({
      track,
      versionCode,
      releaseName,
      releaseNotes,
      status,
      userFraction,
    });
    const updatedTrack = await apiRequest({
      token,
      method: 'PUT',
      url: `${API_BASE}/${packageName}/edits/${edit.id}/tracks/${track}`,
      body: trackBody,
    });
    await apiRequest({
      token,
      method: 'POST',
      url: `${API_BASE}/${packageName}/edits/${edit.id}:validate`,
    });
    const commit = await apiRequest({
      token,
      method: 'POST',
      url: `${API_BASE}/${packageName}/edits/${edit.id}:commit`,
    });
    committed = true;

    return {
      editId: edit.id,
      packageName,
      bundle: bundle
        ? {
          file: basename(bundlePath),
          versionCode,
          sha1: bundle.sha1,
          sha256: bundle.sha256,
        }
        : {
          versionCode: String(versionCode),
          reused: true,
        },
      track: updatedTrack,
      commit,
    };
  } finally {
    if (!committed) {
      await deleteEdit(token, packageName, edit.id);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const serviceAccount = JSON.parse(await readFile(options.key, 'utf8'));
  const token = await createScopedAccessToken(serviceAccount);
  const result = options.mode === 'publish'
    ? await publish({
      token,
      packageName: options.package,
      bundlePath: options.bundle,
      track: options.track,
      releaseName: options.releaseName,
      releaseNotes: options.releaseNotes,
      status: options.status || 'completed',
      versionCode: options.versionCode,
      userFraction: options.userFraction,
    })
    : await probe({token, packageName: options.package, track: options.track});

  console.log(JSON.stringify(result, null, 2));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    if (error.payload) {
      console.error(JSON.stringify(error.payload, null, 2));
    }
    process.exitCode = 1;
  });
}

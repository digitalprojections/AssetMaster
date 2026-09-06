import {readFile} from 'node:fs/promises';
import {basename, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import process from 'node:process';
import {createScopedAccessToken} from './publish-play-open-testing.mjs';

const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD_BASE = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const PLAY_LIMITS = {
  title: 30,
  shortDescription: 80,
  fullDescription: 4000,
};

const IMAGE_TYPES = {
  icon: 'icon',
  featureGraphic: 'featureGraphic',
  phoneScreenshots: 'phoneScreenshots',
  sevenInchScreenshots: 'sevenInchScreenshots',
  tenInchScreenshots: 'tenInchScreenshots',
};

const imageContentTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

export function parseListingArgs(argv) {
  const options = {
    mode: 'validate',
    config: 'play-publishing/store-listings.json',
    languages: undefined,
    includeImages: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--publish') {
      options.mode = 'publish';
      continue;
    }

    if (arg === '--validate') {
      options.mode = 'validate';
      continue;
    }

    if (arg === '--include-images') {
      options.includeImages = true;
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

  if (typeof options.languages === 'string') {
    options.languages = options.languages.split(',').map((language) => language.trim()).filter(Boolean);
  }

  for (const required of ['key', 'package']) {
    if (!options[required]) {
      throw new Error(`Missing required --${required} option.`);
    }
  }

  return options;
}

export function validateStoreListingConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Store listing config must be an object.');
  }

  if (!config.packageName) {
    throw new Error('Store listing config requires packageName.');
  }

  const languages = Object.keys(config.listings || {});
  if (languages.length === 0) {
    throw new Error('Store listing config requires at least one localized listing.');
  }

  for (const language of languages) {
    validateListing(language, config.listings[language]);
  }

  for (const customListing of config.customListings || []) {
    validateListing(customListing.language || customListing.name || 'custom listing', customListing);
    if (customListing.urlParameter && !/^[a-z0-9._~-]+$/u.test(customListing.urlParameter)) {
      throw new Error(`Custom listing ${customListing.name} has an invalid URL parameter.`);
    }
  }

  return {
    packageName: config.packageName,
    languages,
    customListings: config.customListings || [],
  };
}

function validateListing(language, listing) {
  if (!listing || typeof listing !== 'object') {
    throw new Error(`${language} listing must be an object.`);
  }

  for (const field of Object.keys(PLAY_LIMITS)) {
    if (!listing[field]) {
      throw new Error(`${language} listing requires ${field}.`);
    }

    if (listing[field].length > PLAY_LIMITS[field]) {
      throw new Error(`${language} ${field} is ${listing[field].length} characters; limit is ${PLAY_LIMITS[field]}.`);
    }
  }
}

export function buildListingUpdateRequests({packageName, editId, config, languages}) {
  const selectedLanguages = languages || Object.keys(config.listings);
  return selectedLanguages.map((language) => {
    const listing = config.listings[language];
    if (!listing) {
      throw new Error(`No listing found for language ${language}.`);
    }

    return {
      language,
      url: `${API_BASE}/${packageName}/edits/${editId}/listings/${language}`,
      body: {
        title: listing.title,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
      },
    };
  });
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

async function updateDetails({token, packageName, editId, details}) {
  if (!details) {
    return null;
  }

  return apiRequest({
    token,
    method: 'PATCH',
    url: `${API_BASE}/${packageName}/edits/${editId}/details`,
    body: details,
  });
}

async function updateListings({token, packageName, editId, config, languages}) {
  const requests = buildListingUpdateRequests({packageName, editId, config, languages});
  const results = [];

  for (const request of requests) {
    const listing = await apiRequest({
      token,
      method: 'PUT',
      url: request.url,
      body: request.body,
    });
    results.push({language: request.language, listing});
  }

  return results;
}

async function replaceImages({token, packageName, editId, config, languages}) {
  const selectedLanguages = languages || Object.keys(config.images || {});
  const results = [];

  for (const language of selectedLanguages) {
    const languageImages = config.images?.[language];
    if (!languageImages) {
      continue;
    }

    for (const [configImageType, imagePaths] of Object.entries(languageImages)) {
      const imageType = IMAGE_TYPES[configImageType];
      if (!imageType) {
        throw new Error(`Unsupported image type ${configImageType}.`);
      }

      await apiRequest({
        token,
        method: 'DELETE',
        url: `${API_BASE}/${packageName}/edits/${editId}/listings/${language}/${imageType}`,
      });

      for (const imagePath of imagePaths) {
        const image = await readFile(imagePath);
        const contentType = imageContentTypes.get(extname(imagePath).toLowerCase());
        if (!contentType) {
          throw new Error(`Unsupported image extension for ${imagePath}.`);
        }

        const uploaded = await apiRequest({
          token,
          method: 'POST',
          url: `${UPLOAD_BASE}/${packageName}/edits/${editId}/listings/${language}/${imageType}?uploadType=media`,
          body: image,
          contentType,
        });
        results.push({language, imageType, file: basename(imagePath), uploaded});
      }
    }
  }

  return results;
}

async function publishListings({token, packageName, config, languages, includeImages}) {
  const edit = await createEdit(token, packageName);
  let committed = false;
  try {
    const details = await updateDetails({token, packageName, editId: edit.id, details: config.details});
    const listings = await updateListings({token, packageName, editId: edit.id, config, languages});
    const images = includeImages
      ? await replaceImages({token, packageName, editId: edit.id, config, languages})
      : [];

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

    return {editId: edit.id, packageName, details, listings, images, commit};
  } finally {
    if (!committed) {
      await deleteEdit(token, packageName, edit.id);
    }
  }
}

async function main() {
  const options = parseListingArgs(process.argv.slice(2));
  const config = JSON.parse(await readFile(options.config, 'utf8'));
  validateStoreListingConfig(config);

  if (options.mode === 'validate') {
    console.log(JSON.stringify({
      mode: 'validate',
      packageName: options.package,
      configPackageName: config.packageName,
      languages: options.languages || Object.keys(config.listings),
      includeImages: options.includeImages,
      customListings: config.customListings || [],
    }, null, 2));
    return;
  }

  const serviceAccount = JSON.parse(await readFile(options.key, 'utf8'));
  const token = await createScopedAccessToken(serviceAccount);
  const result = await publishListings({
    token,
    packageName: options.package,
    config,
    languages: options.languages,
    includeImages: options.includeImages,
  });

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

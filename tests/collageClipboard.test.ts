import assert from 'node:assert/strict';
import { getClipboardImageFiles, isImageFile } from '../src/utils/collageClipboard';

const createFile = (name: string, type: string) => new File(['assetmaster-test'], name, { type });

const pastedPng = createFile('clipboard.png', 'image/png');
const pastedJpeg = createFile('photo.jpg', 'image/jpeg');
const pastedText = createFile('notes.txt', 'text/plain');

assert.equal(isImageFile(pastedPng), true);
assert.equal(isImageFile(pastedText), false);
assert.deepEqual(getClipboardImageFiles(null), []);

assert.deepEqual(
  getClipboardImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => pastedText },
      { kind: 'file', type: 'image/png', getAsFile: () => pastedPng },
    ],
  }),
  [pastedPng]
);

assert.deepEqual(
  getClipboardImageFiles({
    files: [pastedText, pastedJpeg],
  }),
  [pastedJpeg]
);

assert.deepEqual(
  getClipboardImageFiles({
    items: [{ kind: 'file', type: 'image/png', getAsFile: () => pastedPng }],
    files: [pastedPng],
  }),
  [pastedPng]
);

console.log('collage clipboard tests passed');

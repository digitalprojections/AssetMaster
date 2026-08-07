import assert from 'node:assert/strict';
import {
  DEFAULT_TEXT_BUBBLE_PADDING,
  getTextBubbleLayout,
  normalizeTextBubblePadding,
  normalizeTextBubbleStyle,
} from '../src/utils/collageTextBubble';

const plainLayout = getTextBubbleLayout({
  contentWidth: 120,
  contentHeight: 48,
  style: 'none',
});

assert.equal(normalizeTextBubbleStyle(undefined), 'none');
assert.equal(normalizeTextBubbleStyle('speech'), 'speech');
assert.equal(normalizeTextBubblePadding(undefined), DEFAULT_TEXT_BUBBLE_PADDING);
assert.equal(normalizeTextBubblePadding(2), 8);
assert.equal(normalizeTextBubblePadding(400), 120);
assert.equal(plainLayout.width, 120);
assert.equal(plainLayout.height, 48);
assert.equal(plainLayout.tailHeight, 0);

const speechLayout = getTextBubbleLayout({
  contentWidth: 120,
  contentHeight: 48,
  style: 'speech',
  padding: 24,
});

assert.equal(speechLayout.width, 168);
assert.equal(speechLayout.bubbleHeight, 96);
assert.equal(speechLayout.tailHeight, 24);
assert.equal(speechLayout.height, 120);
assert.equal(speechLayout.contentLeft, -60);

const thoughtLayout = getTextBubbleLayout({
  contentWidth: 80,
  contentHeight: 32,
  style: 'thought',
  padding: 20,
});

assert.equal(thoughtLayout.width, 120);
assert.equal(thoughtLayout.bubbleHeight, 72);
assert.equal(thoughtLayout.tailHeight, 18);
assert.equal(thoughtLayout.height, 90);

console.log('collage text bubble tests passed');

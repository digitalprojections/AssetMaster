import assert from 'node:assert/strict';
import test from 'node:test';
import { getEmptyWorkspaceCopy } from '../src/utils/emptyWorkspace';

test('empty workspace copy presents the editor as a task, not onboarding', () => {
  assert.deepEqual(getEmptyWorkspaceCopy(), {
    title: 'Open an image to begin',
    description: 'Upload an image to start cutting out assets in the editor.',
    actionLabel: 'Upload image',
    hint: 'You can also drag and drop an image onto the canvas.',
  });
});

test('empty workspace copy has one primary entry action', () => {
  const copy = getEmptyWorkspaceCopy();

  assert.equal(copy.actionLabel, 'Upload image');
  assert.doesNotMatch(copy.description, /sample|preset|optional|recommended/i);
  assert.doesNotMatch(copy.hint, /sample|preset|optional|recommended/i);
});

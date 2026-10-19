import assert from 'node:assert/strict';
import test from 'node:test';
import { McpCutoutHistory } from '../src/utils/mcpCutoutHistory';
const item = (id: string, thumbnailUrl = 'pixels') => ({ id, thumbnailUrl });
test('cutout history preserves current edits and only removes owned creations', () => {
  const history = new McpCutoutHistory<{ id: string; thumbnailUrl: string }>();
  history.record(item('agent'));
  const current = item('agent', 'updated-pixels');
  assert.equal(history.undo([item('user'), current]), current);
  assert.equal(history.canUndo, false);
  assert.equal(history.redo(), current);
  assert.equal(history.canRedo, false);
  assert.throws(() => history.undo([item('user')]), /already removed/i);
});
test('cutout history bounds retained image memory and resets on pairing changes', () => {
  const history = new McpCutoutHistory<{ id: string; thumbnailUrl: string }>(2, 20);
  history.record(item('one')); history.record(item('two')); history.record(item('three'));
  assert.equal(history.undo([item('one'), item('two'), item('three')]).id, 'three');
  assert.equal(history.undo([item('one'), item('two')]).id, 'two');
  assert.equal(history.canUndo, false);
  history.record(item('four'));
  assert.equal(history.canRedo, false);
  history.reset(); assert.equal(history.canUndo, false);
});

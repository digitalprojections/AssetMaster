import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFeatureRequest, submitFeatureRequest } from '../src/utils/featureRequests';

test('feature requests require a useful title and description', () => {
  assert.ok(validateFeatureRequest({ title: '', description: '', replyTo: '', website: '' }));
  assert.equal(validateFeatureRequest({ title: 'Timeline markers', description: 'Add named markers to the animation timeline.', replyTo: '', website: '' }), null);
});
test('feature requests validate optional reply address and lengths', () => {
  const valid = { title: 'Timeline markers', description: 'Add named markers to the animation timeline.', replyTo: '', website: '' };
  assert.ok(validateFeatureRequest({ ...valid, replyTo: 'invalid' }));
  assert.ok(validateFeatureRequest({ ...valid, title: 'x'.repeat(121) }));
  assert.ok(validateFeatureRequest({ ...valid, description: 'x'.repeat(5001) }));
  assert.equal(validateFeatureRequest({ ...valid, replyTo: 'user@example.com' }), null);
});
test('delivery failures and non-JSON fallback pages never report success', async () => {
  const request = { title: 'Timeline markers', description: 'Add named markers to the animation timeline.', replyTo: '', website: '' };
  assert.equal(await submitFeatureRequest(request, async () => new Response(JSON.stringify({ ok: true }), { status: 200 })), 'success');
  assert.equal(await submitFeatureRequest(request, async () => new Response('{}', { status: 503 })), 'unavailable');
  assert.equal(await submitFeatureRequest(request, async () => new Response('<html>fallback</html>')), 'error');
  assert.equal(await submitFeatureRequest(request, async () => { throw new Error('offline'); }), 'error');
  assert.equal(await submitFeatureRequest(request, async () => new Response('{}', { status: 429 })), 'limited');
});

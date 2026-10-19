import assert from 'node:assert/strict';
import test from 'node:test';
import { request as httpRequest } from 'node:http';
import { LocalBridge } from '../src/bridge.js';

const origin = 'http://localhost:3001';
async function fixture() {
  const bridge = new LocalBridge({ port: 0, origins: [origin], commandTimeoutMs: 150, heartbeatMs: 250 });
  await bridge.start();
  return bridge;
}
async function request(b: LocalBridge, path: string, body?: unknown, token?: string, requestOrigin = origin) {
  return fetch(`${b.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
}
async function pair(b: LocalBridge) {
  const r = await request(b, '/pair', { code: b.pairingCode });
  assert.equal(r.status, 200);
  return (await r.json() as { token: string }).token;
}
test('rejects foreign origins, invalid pairing codes and unauthenticated requests', async () => {
  const b = await fixture();
  try {
    assert.equal((await request(b, '/pair', { code: b.pairingCode }, undefined, 'https://evil.example')).status, 403);
    assert.equal((await request(b, '/pair', { code: 'wrong' })).status, 401);
    assert.equal((await request(b, '/poll')).status, 401);
    assert.equal(b.status().state, 'unavailable');
  } finally { await b.close(); }
});
test('one workspace pairs, executes a correlated command, then disconnects', async () => {
  const b = await fixture();
  try {
    const token = await pair(b);
    assert.equal((await request(b, '/pair', { code: b.pairingCode })).status, 409);
    const result = b.execute({ action: 'readState' });
    const poll = await request(b, '/poll', {}, token);
    const job = await poll.json() as { id: string; command: unknown };
    assert.deepEqual(job.command, { action: 'readState' });
    assert.equal((await request(b, '/result', { id: 'other', result: {} }, token)).status, 409);
    await request(b, '/result', { id: job.id, result: { ok: true, state: { hasImage: true } } }, token);
    assert.deepEqual(await result, { ok: true, state: { hasImage: true } });
    await request(b, '/disconnect', {}, token);
    assert.equal(b.status().state, 'unavailable');
    assert.equal((await request(b, '/poll', {}, token)).status, 401);
    await assert.rejects(b.execute({ action: 'readState' }), /disconnected/i);
  } finally { await b.close(); }
});
test('timeout is reported as unknown outcome and never retries a mutation', async () => {
  const b = await fixture();
  try {
    const token = await pair(b);
    const pending = assert.rejects(b.execute({ action: 'clearSelection' }), /outcome.*unknown/i);
    await request(b, '/poll', {}, token);
    await pending;
    assert.equal(b.status().state, 'unavailable');
  } finally { await b.close(); }
});
test('rejects additional commands while an edit is in progress', async () => {
  const b = await fixture();
  try {
    await pair(b);
    const first = assert.rejects(b.execute({ action: 'readState' }), /disconnected/i);
    await assert.rejects(b.execute({ action: 'readState' }), /busy/i);
    b.disconnect();
    await first;
  } finally { await b.close(); }
});
test('rejects DNS rebinding host headers and protects setup against framing', async () => {
  const b = await fixture();
  try {
    const status = await new Promise<number | undefined>((resolve, reject) => { const req = httpRequest(b.url, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); req.end(); });
    assert.equal(status, 403);
    const setup = await fetch(b.url);
    assert.match(setup.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.match(await setup.text(), /AssetMaster/);
  } finally { await b.close(); }
});

test('expired heartbeat invalidates the session and rejects stale credentials', async () => {
  const b = await fixture();
  try {
    const token = await pair(b);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(b.status().connected, false);
    assert.equal((await request(b, '/poll', {}, token)).status, 401);
  } finally { await b.close(); }
});
test('session credentials work only on the origin that paired the editor', async () => {
  const b = new LocalBridge({ port: 0, origins: [origin, 'https://created.link'] });
  await b.start();
  try {
    const token = await pair(b);
    assert.equal((await request(b, '/disconnect', {}, token, 'https://created.link')).status, 401);
    assert.equal(b.status().connected, true);
  } finally { await b.close(); }
});

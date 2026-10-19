import assert from 'node:assert/strict';
import test from 'node:test';
import { McpConnection } from '../src/utils/mcpConnection';

test('browser connection reports unavailable pairing as error and never success', async () => {
  const original = globalThis.fetch;
  const states: string[] = [];
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid or expired pairing code.' }), { status: 401 });
  try {
    const connection = new McpConnection('38475', async () => ({ ok: true }), state => states.push(state));
    await connection.connect('bad');
    assert.deepEqual(states, ['loading', 'error']);
    connection.disconnect(false);
  } finally { globalThis.fetch = original; }
});
test('browser executes commands once, reports results, clears credentials on disconnect', async () => {
  const original = globalThis.fetch;
  let executions = 0;
  const calls: { url: string; body: unknown; authorization: unknown }[] = [];
  let resultSent!: () => void;
  const done = new Promise<void>(resolve => { resultSent = resolve; });
  globalThis.fetch = async (input, init) => {
    const url = String(input); const body = JSON.parse(String(init!.body));
    calls.push({ url, body, authorization: (init!.headers as Record<string, string>).Authorization });
    if (url.endsWith('/pair')) return new Response(JSON.stringify({ token: 'temporary-test-token' }));
    if (url.endsWith('/poll') && calls.filter(call => call.url.endsWith('/poll')).length === 1) return new Response(JSON.stringify({ id: 'job', command: { action: 'inspect' } }));
    if (url.endsWith('/result')) { resultSent(); return new Response('{}'); }
    if (url.endsWith('/disconnect')) return new Response('{}');
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  try {
    const states: string[] = [];
    let resets = 0;
    const connection = new McpConnection('38475', async () => { executions++; return { ok: true, state: { hasImage: false } }; }, state => states.push(state), () => resets++);
    await connection.connect('test-code');
    await done;
    connection.disconnect();
    assert.equal(executions, 1);
    assert.equal(resets, 2);
    assert.deepEqual(states, ['loading', 'success', 'unavailable']);
    assert.equal(calls.find(call => call.url.endsWith('/pair'))!.authorization, undefined);
    assert.equal(calls.find(call => call.url.endsWith('/result'))!.authorization, 'Bearer temporary-test-token');
    assert.deepEqual(calls.find(call => call.url.endsWith('/result'))!.body, { id: 'job', result: { ok: true, state: { hasImage: false } } });
  } finally { globalThis.fetch = original; }
});

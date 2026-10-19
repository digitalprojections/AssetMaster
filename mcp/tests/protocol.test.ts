import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

test('built package serves real MCP discovery, resources and disconnected errors over stdio', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/index.js'), '--port', '0'], stderr: 'pipe' });
  const client = new Client({ name: 'assetmaster-protocol-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 10);
    const status = await client.callTool({ name: 'assetmaster_status', arguments: {} });
    const output = status.structuredContent as Record<string, unknown>;
    assert.equal(output.state, 'unavailable');
    assert.match(String(output.pairingUrl), /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal('pairingCode' in output, false);
    const state = await client.callTool({ name: 'assetmaster_get_state', arguments: {} });
    assert.equal(state.isError, true);
    assert.match(JSON.stringify(state), /disconnected/i);
    const file = await client.callTool({ name: 'assetmaster_import_image', arguments: { path: 'private.png' } });
    assert.equal(file.isError, true);
    assert.match(JSON.stringify(file), /File access is disabled/);
    const resources = await client.listResources();
    assert.equal(resources.resources[0].uri, 'assetmaster://workflow');
    const resource = await client.readResource({ uri: 'assetmaster://workflow' });
    assert.match(JSON.stringify(resource), /outcome is unknown/);
    const invalid = await client.callTool({ name: 'assetmaster_create_cutout', arguments: { name: 'bad', rectangle: { x: -1, y: 0, width: 1, height: 1 } } }).catch(error => error);
    assert.ok(invalid instanceof Error || invalid.isError === true);
  } finally { await client.close(); }
});

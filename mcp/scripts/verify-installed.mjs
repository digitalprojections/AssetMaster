import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const [command, entry] = process.argv.slice(2);
const client = new Client({ name: 'assetmaster-install-test', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({ command, args: [entry, '--port', '0'], stderr: 'pipe' }));
  assert.equal((await client.listTools()).tools.length, 10);
  const status = await client.callTool({ name: 'assetmaster_status', arguments: {} });
  assert.equal(status.structuredContent.state, 'unavailable');
  assert.equal(status.structuredContent.version, '1.1.19');
  console.log('Installed MCP stdio discovery verified.');
} finally { await client.close(); }

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const editorOrigin = process.argv[2] ?? 'http://localhost:3001';
const workspace = path.resolve('../.browser-test/mcp');
await mkdir(workspace, { recursive: true });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/index.js'), '--port', '38475', '--workspace', workspace, '--origin', editorOrigin], stderr: 'pipe' });
const client = new Client({ name: 'assetmaster-browser-journey', version: '1.0.0' });
async function call(name, args = {}) {
  const result = await client.callTool({ name: `assetmaster_${name}`, arguments: args });
  if (result.isError) throw new Error(JSON.stringify(result.structuredContent ?? result.content));
  return result;
}
try {
  await client.connect(transport);
  console.log('PAIRING_PAGE', (await call('status')).structuredContent.pairingUrl);
  let connected = false;
  for (let i = 0; i < 240; i++) {
    if ((await call('status')).structuredContent.connected) { connected = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(connected, 'Pair the browser within four minutes.');
  const initial = (await call('list_assets')).structuredContent;
  const imported = (await call('import_image', { path: 'fixture.png' })).structuredContent;
  assert.equal(imported.width, 64); assert.equal(imported.height, 48);
  const cutout = (await call('create_cutout', { name: 'MCP verified cutout', points: [{ x: 8, y: 8 }, { x: 56, y: 8 }, { x: 32, y: 40 }] })).structuredContent;
  const preview = await call('preview', { assetId: cutout.assetId });
  assert.equal(preview.content[0].type, 'image');
  const exported = (await call('export_png', { assetId: cutout.assetId, path: `verified-${Date.now()}.png` })).structuredContent;
  const png = await readFile(exported.path);
  assert.equal(png.readUInt32BE(16), 48); assert.equal(png.readUInt32BE(20), 32);
  await call('undo_cutout');
  assert.equal((await call('list_assets')).structuredContent.total, initial.total);
  await call('undo_cutout', { redo: true });
  assert.equal((await call('list_assets')).structuredContent.total, initial.total + 1);
  await call('editor_command', { action: 'setTool', value: 'rectangle' });
  assert.equal((await call('get_state')).structuredContent.state.activeTool, 'rectangle');
  const batch = (await call('batch_commands', { commands: [{ action: 'zoom100' }, { action: 'toggleSidebar', open: true }] })).structuredContent;
  assert.equal(batch.completed, 2);
  const invalid = await client.callTool({ name: 'assetmaster_create_cutout', arguments: { name: 'outside', rectangle: { x: 63, y: 0, width: 3, height: 2 } } });
  assert.equal(invalid.isError, true);
  const overwrite = await client.callTool({ name: 'assetmaster_export_png', arguments: { assetId: cutout.assetId, path: path.basename(exported.path) } });
  assert.equal(overwrite.isError, true);
  const evidence = { state: 'success', editorOrigin, transport: 'MCP stdio SDK v2', toolCount: (await client.listTools()).tools.length, source: { width: 64, height: 48 }, cutout: { width: 48, height: 32, assetId: cutout.assetId }, output: exported.path, checks: ['browser pairing', 'import', 'polygon cutout', 'image preview', 'verified PNG dimensions', 'undo', 'redo', 'state after edit', 'batch', 'bounds rejection', 'overwrite rejection'] };
  await writeFile(path.join(workspace, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  await call('undo_cutout');
  assert.equal((await call('list_assets')).structuredContent.total, initial.total);
  console.log('WAITING_FOR_DISCONNECT');
  for (let i = 0; i < 180; i++) {
    if (!(await call('status')).structuredContent.connected) { console.log('DISCONNECT_VERIFIED'); break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally { await client.close(); }

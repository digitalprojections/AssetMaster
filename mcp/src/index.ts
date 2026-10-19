#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LocalBridge } from './bridge.js';
import { WorkspaceFiles } from './files.js';
import { createMcpServer, VERSION } from './server.js';

async function main() {
  const { values } = parseArgs({ options: { workspace: { type: 'string' }, port: { type: 'string', default: '38475' }, origin: { type: 'string', multiple: true }, config: { type: 'boolean' }, doctor: { type: 'boolean' }, serve: { type: 'boolean' }, version: { type: 'boolean' }, help: { type: 'boolean' } } });
  if (values.version) { console.log(VERSION); return; }
  if (values.help) { console.log('AssetMaster MCP companion\nUsage: assetmaster-mcp [--workspace <folder>] [--port <port>] [--origin <origin>]\n--config   Print MCP client JSON; makes no changes to client settings.\n--doctor   Validate workspace, runtime, and local port, then exit.\n--serve    Run the browser bridge for manual diagnostics, without MCP stdio.\nDefault mode is MCP over stdio. Configure it in your AI application, call assetmaster_status, and open the pairing URL in your browser.'); return; }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535. Use 0 to choose an available port.');
  const origins = values.origin ?? ['https://created.link', 'http://localhost:3001', 'http://127.0.0.1:3001'];
  for (const origin of origins) { const u = new URL(origin); if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin || u.username || u.password) throw new Error('--origin must be an exact HTTP(S) origin, without a path.'); }
  let workspace: string | undefined;
  if (values.workspace) { workspace = await realpath(values.workspace); if (!(await stat(workspace)).isDirectory()) throw new Error('--workspace must be a directory.'); }
  if (values.config) {
    const args = [fileURLToPath(import.meta.url), '--port', String(port)];
    if (workspace) args.push('--workspace', workspace);
    for (const origin of values.origin ?? []) args.push('--origin', origin);
    console.log(JSON.stringify({ mcpServers: { assetmaster: { command: process.execPath, args } } }, null, 2)); return;
  }
  const bridge = new LocalBridge({ port, origins });
  try { await bridge.start(); } catch (error) { throw new Error(`Cannot start companion on port ${port}. Another process may be using it. Stop that companion or select --port 0. ${error instanceof Error ? error.message : ''}`); }
  if (values.doctor) { console.log(JSON.stringify({ state: 'success', version: VERSION, runtime: process.version, workspace: workspace ?? null, fileAccess: workspace ? 'workspace' : 'disabled', localPort: 'available', origins })); await bridge.close(); return; }
  const server = createMcpServer(bridge, workspace ? new WorkspaceFiles(workspace) : undefined);
  let closing = false;
  async function close() { if (closing) return; closing = true; await bridge.close(); await server.close(); }
  process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
  console.error(`AssetMaster ${VERSION}: open ${bridge.url} in your browser to pair the editor.`);
  if (values.serve) return;
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const onclose = transport.onclose;
  transport.onclose = () => { onclose?.(); void close(); };
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'AssetMaster companion failed.'); process.exitCode = 1; });

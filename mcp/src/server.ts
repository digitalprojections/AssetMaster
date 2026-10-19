import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { LocalBridge, type EditorResult } from './bridge.js';
import { WorkspaceFiles } from './files.js';
export const VERSION = '1.1.19';
const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const command = z.object({ action: z.enum(['readState', 'setTool', 'setFeather', 'setSnapRadius', 'clearSelection', 'toggleSidebar', 'openCollageStudio', 'openAnimationStudio', 'closeOverlays', 'zoomIn', 'zoomOut', 'zoomFit', 'zoom100', 'animationUndo', 'animationRedo', 'animationSetEraser', 'animationSetEraserRadius', 'animationEraseStroke', 'animationSetFrame']), value: z.union([z.string(), z.number().finite(), z.boolean()]).optional(), points: z.array(point).max(10000).optional(), open: z.boolean().optional() });
const text = (data: Record<string, unknown>) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: data });
const annotations = (readOnly = false) => ({ readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false });
export function createMcpServer(bridge: LocalBridge, files?: WorkspaceFiles) {
  const server = new McpServer({ name: 'assetmaster-mcp-server', version: VERSION });
  async function editor(input: unknown) {
    const result = await bridge.execute(input);
    if (!result.ok) throw new Error(result.message ?? 'AssetMaster operation failed.');
    return result;
  }
  const safe = <T>(fn: (input: T) => Promise<ReturnType<typeof text> | { content: ({ type: 'image'; mimeType: string; data: string } | { type: 'text'; text: string })[] }>) => async (input: T) => {
    try { return await fn(input); } catch (error) { return { isError: true, ...text({ state: 'error', message: error instanceof Error ? error.message : 'AssetMaster operation failed.' }) }; }
  };
  server.registerTool('assetmaster_status', { title: 'AssetMaster connection', description: 'Check whether the local AssetMaster editor is connected. If unavailable, ask the user to open pairingUrl in their browser and approve pairing. Never fetch the pairing page on their behalf.', inputSchema: z.object({}), annotations: annotations(true) }, async () => text({ ...bridge.status(), version: VERSION, fileAccess: files ? 'workspace' : 'disabled' }));
  server.registerTool('assetmaster_get_state', { title: 'Inspect AssetMaster', description: 'Read current editor state and enabled editor commands. Requires a paired, open editor.', inputSchema: z.object({}), annotations: annotations(true) }, safe(async () => text(await editor({ action: 'inspect' }))));
  server.registerTool('assetmaster_list_assets', { title: 'List saved assets', description: 'List saved cutout IDs, names and dimensions without image data. Use IDs with preview and export. Source image has ID source.', inputSchema: z.object({ offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(100).default(30) }), annotations: annotations(true) }, safe(async (input) => text(await editor({ action: 'listAssets', ...input }))));
  server.registerTool('assetmaster_import_image', { title: 'Import image', description: 'Load a PNG, JPEG or WebP from the explicitly configured workspace folder. Path is relative to that folder. Replaces the source image; saved cutouts remain. Requires --workspace and a paired editor.', inputSchema: z.object({ path: z.string().min(1) }), annotations: annotations() }, safe(async ({ path }) => {
    if (!files) throw new Error('File access is disabled. Configure --workspace with the folder the user wants to edit, then restart the server.');
    const image = await files.importImage(path);
    return text(await editor({ action: 'importImage', ...image }));
  }));
  server.registerTool('assetmaster_create_cutout', { title: 'Create transparent cutout', description: 'Create a saved transparent PNG cutout from the source image using a rectangle or closed polygon in source image pixels. Supply exactly one of rectangle or points. Returns an asset ID; inspect with preview before exporting.', inputSchema: z.object({ name: z.string().trim().min(1).max(160), rectangle: z.object({ x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive() }).optional(), points: z.array(point).min(3).max(10000).optional(), feather: z.number().min(0).max(40).default(0) }), annotations: annotations() }, safe(async (input) => text(await editor({ action: 'createCutout', ...input }))));
  server.registerTool('assetmaster_preview', { title: 'Preview asset', description: 'Return a PNG preview of source or a saved cutout for visual inspection. The preview image is shared with your AI application and may reach its model provider. Maximum preview edge is 1024px.', inputSchema: z.object({ assetId: z.string().default('source') }), annotations: annotations(true) }, safe(async ({ assetId }) => {
    const result = await editor({ action: 'preview', assetId });
    if (typeof result.dataUrl !== 'string' || !result.dataUrl.startsWith('data:image/png;base64,')) throw new Error('Editor did not return a PNG preview.');
    return { content: [{ type: 'image' as const, mimeType: 'image/png', data: result.dataUrl.slice('data:image/png;base64,'.length) }, { type: 'text' as const, text: JSON.stringify({ assetId, width: result.width, height: result.height }) }] };
  }));
  server.registerTool('assetmaster_export_png', { title: 'Export PNG', description: 'Write source or a saved cutout as PNG inside the configured workspace folder. Supply a new relative .png path; existing files are never overwritten. Returns the verified output path and byte count.', inputSchema: z.object({ assetId: z.string().min(1), path: z.string().min(1) }), annotations: annotations() }, safe(async ({ assetId, path }) => {
    if (!files) throw new Error('File access is disabled. Configure --workspace and restart the server.');
    const result = await editor({ action: 'exportPng', assetId });
    if (typeof result.dataUrl !== 'string') throw new Error('Editor did not return PNG data.');
    return text({ state: 'success', ...await files.exportPng(path, result.dataUrl) });
  }));
  server.registerTool('assetmaster_undo_cutout', { title: 'Undo agent cutout', description: 'Undo the most recent cutout created by this paired session. Other saved assets are preserved. Use redo to restore it.', inputSchema: z.object({ redo: z.boolean().default(false) }), annotations: annotations() }, safe(async ({ redo }) => text(await editor({ action: redo ? 'redoCutout' : 'undoCutout' }))));
  server.registerTool('assetmaster_editor_command', { title: 'Control editor', description: 'Run an existing editor or animation command. Read get_state capabilities first. Animation actions require Animation Studio to be open and ready. Results include editor state after React commits the change.', inputSchema: command, annotations: annotations() }, safe(async (input) => text(await editor({ action: 'editorCommand', command: input }))));
  server.registerTool('assetmaster_batch_commands', { title: 'Run editor commands in sequence', description: 'Run up to 100 editor commands sequentially in one request. Stops on the first error and reports completed results; earlier successful edits remain applied. This is not an atomic transaction. Do not retry the whole batch after a failure.', inputSchema: z.object({ commands: z.array(command).min(1).max(100) }), annotations: annotations() }, safe(async ({ commands }) => text(await editor({ action: 'batchCommands', commands }))));
  server.registerResource('assetmaster-workflow', 'assetmaster://workflow', { title: 'AssetMaster workflow', description: 'Connection, editing, file access and recovery guidance.', mimeType: 'text/plain' }, async () => ({ contents: [{ uri: 'assetmaster://workflow', mimeType: 'text/plain', text: 'Use assetmaster_status first. Ask the user to open pairingUrl if disconnected. Inspect state and list assets before editing. Import only files the user requested from the configured workspace. Create cutouts in source pixel coordinates, preview them, then export to a new .png file. Preview images may reach the AI provider. The editor must remain open. On timeout the outcome is unknown: reconnect and inspect before repeating. Undo/redo cutout affects only cutouts created during the current pairing. Animation undo/redo uses the editor history. File picker and browser download commands are intentionally handled by the user; use import_image/export_png for agent file I/O.' }] }));
  return server;
}

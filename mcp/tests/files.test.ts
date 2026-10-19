import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WorkspaceFiles } from '../src/files.js';

test('workspace files allow PNG import and explicit export without overwriting', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'assetmaster-mcp-'));
  try {
    const files = new WorkspaceFiles(root);
    const data = Buffer.from('iVBORw0KGgo=', 'base64');
    await writeFile(path.join(root, 'input.png'), data);
    const imported = await files.importImage('input.png');
    assert.equal(imported.name, 'input.png');
    assert.equal(imported.dataUrl, `data:image/png;base64,${data.toString('base64')}`);
    await files.exportPng('out.png', imported.dataUrl);
    assert.deepEqual(await readFile(path.join(root, 'out.png')), data);
    await assert.rejects(files.exportPng('out.png', imported.dataUrl), /exist/i);
    await assert.rejects(files.importImage('../outside.png'), /workspace/i);
    await assert.rejects(files.exportPng('../outside.png', imported.dataUrl), /workspace/i);
    await assert.rejects(files.exportPng('bad.png', 'data:text/html;base64,WA=='), /PNG/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('resolves directory links before allowing file access', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'assetmaster-links-'));
  try {
    await mkdir(path.join(root, 'workspace'));
    await mkdir(path.join(root, 'outside'));
    await writeFile(path.join(root, 'outside', 'secret.png'), 'secret');
    await symlink(path.join(root, 'outside'), path.join(root, 'workspace', 'link'), 'junction');
    const files = new WorkspaceFiles(path.join(root, 'workspace'));
    await assert.rejects(files.importImage('link/secret.png'), /workspace/i);
    await assert.rejects(files.exportPng('link/new.png', 'data:image/png;base64,iVBORw0KGgo='), /workspace/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

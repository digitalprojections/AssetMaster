import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const canonicalUrl = 'https://created.link/assetmaster/';
const agentManifestUrl = 'https://created.link/assetmaster/agent.json';
const wellKnownAgentUrl = 'https://created.link/assetmaster/.well-known/assetmaster-agent.json';
const llmsUrl = 'https://created.link/assetmaster/llms.txt';

test('document head advertises the AI agent manifest and LLM context', () => {
  const html = readFileSync('index.html', 'utf8');

  assert.match(html, /<link rel="agent-manifest" type="application\/json" href="%BASE_URL%agent\.json" \/>/);
  assert.match(html, /<link rel="alternate" type="application\/json" href="%BASE_URL%agent\.json" title="AI agent control manifest" \/>/);
  assert.match(html, /<link rel="alternate" type="text\/plain" href="%BASE_URL%llms\.txt" title="LLMs context" \/>/);
  assert.match(html, /"softwareHelp": "https:\/\/created\.link\/assetmaster\/llms\.txt"/);
});

test('public agent manifest describes the browser bridge and guarded commands', () => {
  const manifest = JSON.parse(readFileSync('public/agent.json', 'utf8'));

  assert.equal(manifest.application.url, canonicalUrl);
  assert.equal(manifest.discovery.manifest_url, agentManifestUrl);
  assert.equal(manifest.discovery.well_known_url, wellKnownAgentUrl);
  assert.equal(manifest.discovery.llms_url, llmsUrl);
  assert.equal(manifest.control_surfaces[0].name, 'window.assetMasterAgent');
  assert.equal(manifest.control_surfaces[0].ready_event, 'assetmaster-agent-ready');
  assert.equal(manifest.control_surfaces[0].dom_hooks.actions, '[data-agent-action]');

  const commands = new Map(manifest.commands.map((command: { action: string }) => [command.action, command]));
  assert.equal(commands.has('readState'), true);
  assert.equal(commands.has('setTool'), true);
  assert.equal(commands.has('exportLibrary'), true);
  assert.equal((commands.get('requestUpload') as { confirmation_required: boolean }).confirmation_required, true);
  assert.equal((commands.get('exportLibrary') as { confirmation_required: boolean }).confirmation_required, true);
});

test('well-known agent pointer resolves back to the canonical manifest', () => {
  const pointer = JSON.parse(readFileSync('public/.well-known/assetmaster-agent.json', 'utf8'));

  assert.equal(pointer.manifest_url, agentManifestUrl);
  assert.equal(pointer.application_url, canonicalUrl);
  assert.equal(pointer.control_surface, 'window.assetMasterAgent');
});

test('sitemap includes human and machine discovery resources', () => {
  const sitemap = readFileSync('public/sitemap.xml', 'utf8');

  assert.match(sitemap, new RegExp(`<loc>${canonicalUrl}</loc>`));
  assert.match(sitemap, new RegExp(`<loc>${agentManifestUrl}</loc>`));
  assert.match(sitemap, new RegExp(`<loc>${wellKnownAgentUrl}</loc>`));
  assert.match(sitemap, new RegExp(`<loc>${llmsUrl}</loc>`));
});

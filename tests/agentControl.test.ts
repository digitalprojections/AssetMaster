import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AgentControlSnapshot,
  clampAgentNumber,
  getAgentControlCapabilities,
  validateAgentCommand,
} from '../src/utils/agentControl';

const createSnapshot = (overrides: Partial<AgentControlSnapshot> = {}): AgentControlSnapshot => ({
  activeTool: 'magnetic',
  hasImage: true,
  imageName: 'sprite.png',
  imageSize: { width: 640, height: 480 },
  activeSelectionPoints: 4,
  savedSegmentCount: 2,
  zoomPercent: 100,
  sidebarOpen: true,
  overlays: {
    preview: false,
    collageStudio: false,
    animationStudio: false,
    backgroundRemover: false,
  },
  ...overrides,
});

test('agent capabilities disable image-only commands until an image is loaded', () => {
  const capabilities = getAgentControlCapabilities(createSnapshot({
    hasImage: false,
    imageName: '',
    imageSize: null,
    activeSelectionPoints: 0,
  }));

  assert.equal(capabilities.find((item) => item.action === 'setTool')?.enabled, false);
  assert.equal(capabilities.find((item) => item.action === 'zoomFit')?.enabled, false);
  assert.equal(capabilities.find((item) => item.action === 'readState')?.enabled, true);
});

test('agent commands require explicit confirmation for local file and download actions', () => {
  const uploadResult = validateAgentCommand({ action: 'requestUpload' }, createSnapshot());
  const exportResult = validateAgentCommand({ action: 'exportLibrary' }, createSnapshot());
  const confirmedResult = validateAgentCommand({ action: 'exportLibrary', confirm: true }, createSnapshot());

  assert.equal(uploadResult.ok, false);
  assert.equal(uploadResult.needsConfirmation, true);
  assert.equal(exportResult.ok, false);
  assert.equal(exportResult.needsConfirmation, true);
  assert.equal(confirmedResult.ok, true);
});

test('agent command validation rejects unknown tools and accepts supported ones', () => {
  assert.deepEqual(validateAgentCommand({ action: 'setTool', value: 'brush' }, createSnapshot()), {
    ok: false,
    message: 'setTool value must be select, rectangle, lasso, or magnetic.',
  });

  assert.equal(validateAgentCommand({ action: 'setTool', value: 'rectangle' }, createSnapshot()).ok, true);
});

test('agent numeric values clamp to the configured control range', () => {
  assert.equal(clampAgentNumber(100, 12, 5, 40), 40);
  assert.equal(clampAgentNumber(-10, 12, 5, 40), 5);
  assert.equal(clampAgentNumber('30', 12, 5, 40), 12);
});

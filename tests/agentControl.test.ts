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
  animationStudio: null,
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

test('animation agent commands are disabled until animation controls are registered', () => {
  const capabilities = getAgentControlCapabilities(createSnapshot({
    overlays: {
      preview: false,
      collageStudio: false,
      animationStudio: true,
      backgroundRemover: false,
    },
  }));

  assert.equal(capabilities.find((item) => item.action === 'animationSetEraser')?.enabled, false);
  assert.equal(capabilities.find((item) => item.action === 'animationEraseStroke')?.enabled, false);
});

test('animation agent commands validate frame controls and erase strokes', () => {
  const snapshot = createSnapshot({
    overlays: {
      preview: false,
      collageStudio: false,
      animationStudio: true,
      backgroundRemover: false,
    },
    animationStudio: {
      available: true,
      frameCount: 3,
      activeFrameIndex: 1,
      isPlaying: false,
      eraserActive: false,
      eraserRadius: 12,
      canUndo: true,
      canRedo: false,
      canErase: true,
      activeFrameHasEraseMask: false,
    },
  });

  assert.equal(validateAgentCommand({ action: 'animationUndo' }, snapshot).ok, true);
  assert.equal(validateAgentCommand({ action: 'animationRedo' }, snapshot).ok, false);
  assert.equal(validateAgentCommand({ action: 'animationSetEraser', value: true }, snapshot).ok, true);
  assert.equal(validateAgentCommand({ action: 'animationSetEraserRadius', value: 18 }, snapshot).ok, true);
  assert.equal(validateAgentCommand({ action: 'animationSetFrame', value: 2 }, snapshot).ok, true);
  assert.equal(validateAgentCommand({ action: 'animationSetFrame', value: 3 }, snapshot).ok, false);
  assert.equal(validateAgentCommand({
    action: 'animationEraseStroke',
    points: [{ x: 10, y: 12 }, { x: 20, y: 24 }],
    value: 6,
  }, snapshot).ok, true);
  assert.equal(validateAgentCommand({ action: 'animationEraseStroke', points: [] }, snapshot).ok, false);
});

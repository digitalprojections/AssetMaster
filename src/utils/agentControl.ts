import { Point, SelectionTool } from '../types';

export type AgentAction =
  | 'readState'
  | 'setTool'
  | 'setFeather'
  | 'setSnapRadius'
  | 'clearSelection'
  | 'toggleSidebar'
  | 'openCollageStudio'
  | 'openAnimationStudio'
  | 'closeOverlays'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'zoom100'
  | 'requestUpload'
  | 'exportLibrary'
  | 'animationUndo'
  | 'animationRedo'
  | 'animationSetEraser'
  | 'animationSetEraserRadius'
  | 'animationEraseStroke'
  | 'animationSetFrame';

export type AgentCommand = {
  action: AgentAction;
  value?: unknown;
  points?: Point[];
  open?: boolean;
  confirm?: boolean;
};

export type AgentActionCapability = {
  action: AgentAction;
  description: string;
  enabled: boolean;
  confirmationRequired: boolean;
};

export type AgentControlSnapshot = {
  activeTool: SelectionTool;
  hasImage: boolean;
  imageName: string;
  imageSize: { width: number; height: number } | null;
  activeSelectionPoints: number;
  savedSegmentCount: number;
  zoomPercent: number;
  sidebarOpen: boolean;
  animationStudio: {
    available: boolean;
    frameCount: number;
    activeFrameIndex: number;
    isPlaying: boolean;
    eraserActive: boolean;
    eraserRadius: number;
    canUndo: boolean;
    canRedo: boolean;
    canErase: boolean;
    activeFrameHasEraseMask: boolean;
  } | null;
  overlays: {
    preview: boolean;
    collageStudio: boolean;
    animationStudio: boolean;
    backgroundRemover: boolean;
  };
};

export type AgentCommandValidation =
  | { ok: true; command: AgentCommand }
  | { ok: false; message: string; needsConfirmation?: boolean };

const SELECTION_TOOLS: SelectionTool[] = ['select', 'rectangle', 'lasso', 'magnetic'];

const hasValidPoint = (point: unknown): point is Point => (
  Boolean(point) &&
  typeof point === 'object' &&
  typeof (point as Point).x === 'number' &&
  Number.isFinite((point as Point).x) &&
  typeof (point as Point).y === 'number' &&
  Number.isFinite((point as Point).y)
);

export const getAgentControlCapabilities = (
  snapshot: AgentControlSnapshot
): AgentActionCapability[] => {
  const animationReady = snapshot.overlays.animationStudio && snapshot.animationStudio?.available === true;
  const animationCanErase = animationReady && snapshot.animationStudio?.canErase === true;

  return [
    {
      action: 'readState',
      description: 'Inspect the current editor state.',
      enabled: true,
      confirmationRequired: false,
    },
    {
      action: 'setTool',
      description: 'Switch the active selection tool.',
      enabled: snapshot.hasImage,
      confirmationRequired: false,
    },
    {
      action: 'setFeather',
      description: 'Set feathering in pixels from 0 to 40.',
      enabled: true,
      confirmationRequired: false,
    },
    {
      action: 'setSnapRadius',
      description: 'Set snapping radius in pixels from 5 to 40.',
      enabled: true,
      confirmationRequired: false,
    },
    {
      action: 'clearSelection',
      description: 'Discard the active, unsaved selection.',
      enabled: snapshot.activeSelectionPoints > 0,
      confirmationRequired: false,
    },
    {
      action: 'toggleSidebar',
      description: 'Open or close the settings and saved cuts panel.',
      enabled: true,
      confirmationRequired: false,
    },
    {
      action: 'openCollageStudio',
      description: 'Open the collage workspace.',
      enabled: true,
      confirmationRequired: false,
    },
    {
      action: 'openAnimationStudio',
      description: 'Open the animation workspace.',
      enabled: true,
      confirmationRequired: false,
    },
    {
      action: 'closeOverlays',
      description: 'Close open preview, cleanup, collage, or animation overlays.',
      enabled: Object.values(snapshot.overlays).some(Boolean),
      confirmationRequired: false,
    },
    {
      action: 'zoomIn',
      description: 'Zoom into the loaded image.',
      enabled: snapshot.hasImage,
      confirmationRequired: false,
    },
    {
      action: 'zoomOut',
      description: 'Zoom out from the loaded image.',
      enabled: snapshot.hasImage,
      confirmationRequired: false,
    },
    {
      action: 'zoomFit',
      description: 'Fit the loaded image inside the workspace.',
      enabled: snapshot.hasImage,
      confirmationRequired: false,
    },
    {
      action: 'zoom100',
      description: 'Center the loaded image at actual size.',
      enabled: snapshot.hasImage,
      confirmationRequired: false,
    },
    {
      action: 'requestUpload',
      description: 'Open the image picker for user-approved import.',
      enabled: true,
      confirmationRequired: true,
    },
    {
      action: 'exportLibrary',
      description: 'Download the saved cutout library as JSON.',
      enabled: snapshot.savedSegmentCount > 0,
      confirmationRequired: true,
    },
    {
      action: 'animationUndo',
      description: 'Undo the latest animation edit.',
      enabled: animationReady && snapshot.animationStudio?.canUndo === true,
      confirmationRequired: false,
    },
    {
      action: 'animationRedo',
      description: 'Redo the next animation edit.',
      enabled: animationReady && snapshot.animationStudio?.canRedo === true,
      confirmationRequired: false,
    },
    {
      action: 'animationSetEraser',
      description: 'Turn the animation frame eraser on or off.',
      enabled: animationCanErase,
      confirmationRequired: false,
    },
    {
      action: 'animationSetEraserRadius',
      description: 'Set the animation frame eraser radius in pixels.',
      enabled: animationCanErase,
      confirmationRequired: false,
    },
    {
      action: 'animationEraseStroke',
      description: 'Erase pixels from the active animation frame using frame-local points.',
      enabled: animationCanErase,
      confirmationRequired: false,
    },
    {
      action: 'animationSetFrame',
      description: 'Select the active animation frame by zero-based index.',
      enabled: animationReady && (snapshot.animationStudio?.frameCount ?? 0) > 0,
      confirmationRequired: false,
    },
  ];
};

export const validateAgentCommand = (
  command: unknown,
  snapshot: AgentControlSnapshot
): AgentCommandValidation => {
  if (!command || typeof command !== 'object') {
    return { ok: false, message: 'Command must be an object.' };
  }

  const action = (command as { action?: unknown }).action;
  if (typeof action !== 'string') {
    return { ok: false, message: 'Command action is required.' };
  }

  const capability = getAgentControlCapabilities(snapshot).find((item) => item.action === action);
  if (!capability) {
    return { ok: false, message: `Unsupported command: ${action}.` };
  }
  if (!capability.enabled) {
    return { ok: false, message: `${action} is not available in the current editor state.` };
  }
  if (capability.confirmationRequired && (command as AgentCommand).confirm !== true) {
    return {
      ok: false,
      message: `${action} requires confirm: true because it opens local file or download controls.`,
      needsConfirmation: true,
    };
  }
  if (action === 'setTool' && !SELECTION_TOOLS.includes((command as AgentCommand).value as SelectionTool)) {
    return { ok: false, message: 'setTool value must be select, rectangle, lasso, or magnetic.' };
  }
  if (action === 'animationSetEraser' && typeof (command as AgentCommand).value !== 'boolean') {
    return { ok: false, message: 'animationSetEraser value must be true or false.' };
  }
  if (action === 'animationSetEraserRadius') {
    const value = (command as AgentCommand).value;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, message: 'animationSetEraserRadius value must be a finite number.' };
    }
  }
  if (action === 'animationSetFrame') {
    const value = (command as AgentCommand).value;
    const frameCount = snapshot.animationStudio?.frameCount ?? 0;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= frameCount) {
      return { ok: false, message: `animationSetFrame value must be an integer from 0 to ${Math.max(0, frameCount - 1)}.` };
    }
  }
  if (action === 'animationEraseStroke') {
    const points = (command as AgentCommand).points;
    const radius = (command as AgentCommand).value;
    if (!Array.isArray(points) || points.length === 0 || !points.every(hasValidPoint)) {
      return { ok: false, message: 'animationEraseStroke points must include at least one finite { x, y } point.' };
    }
    if (radius !== undefined && (typeof radius !== 'number' || !Number.isFinite(radius))) {
      return { ok: false, message: 'animationEraseStroke value must be a finite radius when provided.' };
    }
  }

  return { ok: true, command: { ...(command as AgentCommand), action: action as AgentAction } };
};

export const clampAgentNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
};

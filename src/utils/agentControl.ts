import { SelectionTool } from '../types';

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
  | 'exportLibrary';

export type AgentCommand = {
  action: AgentAction;
  value?: unknown;
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

export const getAgentControlCapabilities = (
  snapshot: AgentControlSnapshot
): AgentActionCapability[] => [
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
];

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

  return { ok: true, command: { ...(command as AgentCommand), action: action as AgentAction } };
};

export const clampAgentNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
};

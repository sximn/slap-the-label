import { setContext, getContext } from 'svelte';
import type {
  DrawSettings,
  ImageData,
  AnnotationFile,
  AnnotationLayer,
  DisplaySettings,
  ImageCoordinateSpace,
  RasterTarget,
  RasterPreviewSettings,
  ImportRole,
  ImportedSource,
} from '$lib/types';
import { SvelteMap } from 'svelte/reactivity';
import { withRasterPreview } from '$lib/utils/rasterPreview';
import { getImportTransition, importFiles } from '$lib/utils/files/loader';

const CONTEXT_KEY = Symbol('CANVAS');

export type HistoryActionPayload =
  | { type: 'import'; payload: { source: ImportedSource; role: ImportRole; layerId: string } }
  | { type: 'import-role'; payload: { importId: number; role: ImportRole } }
  | { type: 'image'; payload: { data: ImageData; name: string; imageId: string } }
  | { type: 'mask'; payload: { data: ImageData } }
  | { type: 'raster-preview'; payload: { target: RasterTarget; data: ImageData } }
  | {
      type: 'annotation';
      payload:
        | { action: 'add'; file: AnnotationFile; layerId: string }
        | { action: 'remove'; layerId: string };
    }
  | { type: 'visibility'; payload: { layerId: string; visible: boolean } }
  | { type: 'coordinates'; payload: { layerId: string; coordinateSpace: ImageCoordinateSpace } }
  | { type: 'clear'; payload?: never };

export type HistoryActionType = HistoryActionPayload['type'];

export type HistoryEntry = HistoryActionPayload & {
  label: string;
  timestamp: number;
};

export interface FailedImportAttempt {
  source: ImportedSource;
  role: ImportRole;
  error: string;
  timestamp: number;
}

export function createCanvasContext() {
  let imageData = $state<ImageData | null>(null);
  let imageId = $state<string | null>(null);
  let imageFileName = $state<string>('');

  let maskData = $state<ImageData | null>(null);
  let annotationFiles = $state<AnnotationLayer[]>([]);
  let classColors: Map<string, string> = new SvelteMap();

  let stageSettings = $state<{ zoomX: number; zoomY: number }>({ zoomX: 1, zoomY: 1 });
  let drawSettings = $state<DrawSettings>({ lineWidth: 2, showLabels: true });
  let displaySettings = $state<DisplaySettings>({
    colorMode: 'file',
    maskVisualization: 'normal',
    maskOpacity: 0.5,
  });

  let history = $state<HistoryEntry[]>([]);
  let historyIndex = $state<number>(-1);
  let historyBaseline = captureDocument();
  let importErrors = $state<string[]>([]);
  let failedImports = $state<FailedImportAttempt[]>([]);
  let isImporting = $state(false);
  let historyErrors = $state<Record<number, string>>({});
  let roleErrors = $state<Record<number, string>>({});
  let lastTimestamp = 0;

  function nextTimestamp() {
    return (lastTimestamp = Math.max(Date.now(), lastTimestamp + 1));
  }

  function cloneAnnotationFiles(files: AnnotationLayer[]) {
    return structuredClone($state.snapshot(files));
  }

  function captureDocument() {
    return {
      imageData,
      imageId,
      imageFileName,
      maskData,
      annotationFiles: cloneAnnotationFiles(annotationFiles),
      classColors: new Map(classColors),
      drawSettings: { ...drawSettings },
    };
  }

  function restoreDocument(document: ReturnType<typeof captureDocument>) {
    imageData = document.imageData;
    imageId = document.imageId;
    imageFileName = document.imageFileName;
    maskData = document.maskData;
    annotationFiles = cloneAnnotationFiles(document.annotationFiles);
    classColors = new SvelteMap(document.classColors);
    Object.assign(drawSettings, document.drawSettings);
  }

  function resetDocument() {
    imageData = null;
    imageId = null;
    imageFileName = '';
    maskData = null;
    annotationFiles = [];
    classColors = new SvelteMap();

    drawSettings.lineWidth = 2;
    drawSettings.showLabels = true;
  }

  function appendAnnotationLayer(file: AnnotationFile, layerId: string) {
    // Keep the ID stored by the action, including during history replay.
    annotationFiles.push({ ...file, id: layerId });
  }

  function applyAction(action: HistoryActionPayload) {
    switch (action.type) {
      case 'import': {
        const transition = getImportTransition(
          action.payload.source,
          action.payload.role,
          imageData,
        );
        if (transition.type === 'annotation') {
          appendAnnotationLayer(transition.payload.file, action.payload.layerId);
        } else if (transition.type === 'image') {
          applyAction({
            ...transition,
            payload: { ...transition.payload, imageId: action.payload.layerId },
          });
        } else {
          applyAction(transition);
        }
        break;
      }
      case 'import-role':
        // Role overrides are resolved before replaying imports.
        break;
      case 'image':
        resetDocument();
        imageData = action.payload.data;
        imageId = action.payload.imageId;
        imageFileName = action.payload.name;
        break;

      case 'mask':
        maskData = action.payload.data;
        break;

      case 'raster-preview':
        if (
          (action.payload.target === 'image' ? imageData : maskData)?.raster !==
          action.payload.data.raster
        ) {
          throw new Error(
            'This preview targets a raster that is no longer active after changing import roles.',
          );
        }
        if (action.payload.target === 'image') imageData = action.payload.data;
        else maskData = action.payload.data;
        break;

      case 'annotation': {
        const { payload } = action;
        if (payload.action === 'add') {
          // clone to avoid mutating the history entry when visibility changes
          appendAnnotationLayer(payload.file, payload.layerId);
        } else {
          annotationFiles = annotationFiles.filter((f) => f.id !== payload.layerId);
        }
        break;
      }

      case 'visibility': {
        const { payload } = action;
        const file = annotationFiles.find((f) => f.id === payload.layerId);
        if (file) {
          file.visible = payload.visible;
        }
        break;
      }

      case 'clear':
        resetDocument();
        break;

      case 'coordinates': {
        const file = annotationFiles.find((f) => f.id === action.payload.layerId);
        if (file) file.coordinateSpace = action.payload.coordinateSpace;
        break;
      }
    }
  }

  function roleOverrides() {
    const roles = new Map<number, ImportRole>();
    for (let i = 0; i <= historyIndex; i++) {
      const entry = history[i];
      if (entry?.type === 'import-role') roles.set(entry.payload.importId, entry.payload.role);
    }
    return roles;
  }

  function applyEntry(entry: HistoryEntry, overrides = roleOverrides()) {
    try {
      applyAction(
        entry.type === 'import'
          ? {
              ...entry,
              payload: {
                ...entry.payload,
                role: overrides.get(entry.timestamp) ?? entry.payload.role,
              },
            }
          : entry,
      );
      delete historyErrors[entry.timestamp];
    } catch (error) {
      historyErrors[entry.timestamp] = error instanceof Error ? error.message : String(error);
    }
  }

  function recomputeState() {
    restoreDocument(historyBaseline);
    historyErrors = {};
    roleErrors = {};
    const overrides = roleOverrides();
    for (let i = 0; i <= historyIndex; i++) {
      const entry = history[i];
      if (entry) applyEntry(entry, overrides);
    }
  }

  function getImportRoleError(importId: number, role: ImportRole): string | undefined {
    const attempt = failedImports.find((item) => item.timestamp === importId);
    if (attempt) {
      if (isImporting) return 'Wait for the current import to finish.';
      try {
        getImportTransition(attempt.source, role, imageData);
      } catch (reason) {
        return reason instanceof Error ? reason.message : String(reason);
      }
      return;
    }
    const index = history.findIndex((entry) => entry.timestamp === importId);
    const entry = history[index];
    if (entry?.type !== 'import') return 'This history step is not an import.';
    if (isImporting) return 'Wait for the current import to finish.';
    if (index > historyIndex) return 'Redo this history step before changing its interpretation.';

    // Compatibility depends on the image at this import, not the currently visible image.
    // Resolve only that image, without mutating the document while the menu is rendering.
    let precedingImage = historyBaseline.imageData;
    const overrides = roleOverrides();
    for (let i = 0; i < index; i++) {
      const previous = history[i];
      if (previous.type === 'image') precedingImage = previous.payload.data;
      else if (previous.type === 'clear') precedingImage = null;
      else if (
        previous.type === 'raster-preview' &&
        previous.payload.target === 'image' &&
        precedingImage?.raster === previous.payload.data.raster
      ) {
        precedingImage = previous.payload.data;
      } else if (previous.type === 'import') {
        try {
          const transition = getImportTransition(
            previous.payload.source,
            overrides.get(previous.timestamp) ?? previous.payload.role,
            precedingImage,
          );
          if (transition.type === 'image') precedingImage = transition.payload.data;
        } catch {
          // Failed imports leave the preceding image unchanged, just as during replay.
        }
      }
    }
    try {
      getImportTransition(entry.payload.source, role, precedingImage);
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  }

  const context = {
    get importErrors() {
      return importErrors;
    },
    get failedImports() {
      return failedImports;
    },
    get isImporting() {
      return isImporting;
    },
    dismissImportErrors() {
      importErrors = [];
    },
    async importFiles(files: File[], role?: ImportRole) {
      if (isImporting) {
        importErrors = [
          'An import is already running. Wait for it to finish before importing more files.',
        ];
        return;
      }
      isImporting = true;
      importErrors = [];
      try {
        const result = await importFiles(files, context, role);
        importErrors = result.errors;
      } catch (error) {
        importErrors = [error instanceof Error ? error.message : String(error)];
      } finally {
        isImporting = false;
      }
    },
    addImport(source: ImportedSource, role: ImportRole): string | undefined {
      try {
        this.addToHistory('import', source.name, { source, role, layerId: crypto.randomUUID() });
      } catch (reason) {
        const error = reason instanceof Error ? reason.message : String(reason);
        // Retain the decoded source for correction without forking document history.
        failedImports.push({ source, role, error, timestamp: nextTimestamp() });
        return error;
      }
    },
    getImportRole(importId: number): ImportRole | undefined {
      const attempt = failedImports.find((item) => item.timestamp === importId);
      if (attempt) return attempt.role;
      const entry = history.find((item) => item.timestamp === importId);
      return entry?.type === 'import'
        ? (roleOverrides().get(importId) ?? entry.payload.role)
        : undefined;
    },
    getHistoryError(id: number): string | undefined {
      return (
        roleErrors[id] ??
        historyErrors[id] ??
        failedImports.find((attempt) => attempt.timestamp === id)?.error
      );
    },
    getImportRoleError,
    changeImportRole(importId: number, role: ImportRole) {
      const attempt = failedImports.find((item) => item.timestamp === importId);
      if (attempt) {
        const error = getImportRoleError(importId, role);
        if (error) {
          roleErrors[importId] = error;
          return;
        }
        this.addToHistory('import', attempt.source.name, {
          source: attempt.source,
          role,
          layerId: crypto.randomUUID(),
        });
        failedImports = failedImports.filter((item) => item.timestamp !== importId);
        delete roleErrors[importId];
        importErrors = [];
        return;
      }
      const index = history.findIndex((entry) => entry.timestamp === importId);
      const entry = history[index];
      if (entry?.type !== 'import') return;
      const error = getImportRoleError(importId, role);
      if (error) {
        roleErrors[importId] = error;
        return;
      }
      delete roleErrors[importId];
      if (this.getImportRole(importId) === role) return;
      this.addToHistory('import-role', `Treat ${entry.payload.source.name} as ${role}`, {
        importId,
        role,
      });
      importErrors = [];
    },
    get imageData() {
      return imageData;
    },
    get imageId() {
      return imageId;
    },
    get imageFileName() {
      return imageFileName;
    },
    get maskData() {
      return maskData;
    },
    get annotationFiles() {
      return annotationFiles;
    },
    get classColors() {
      return classColors;
    },
    get drawSettings() {
      return drawSettings;
    },
    get displaySettings() {
      return displaySettings;
    },
    get history() {
      return history;
    },
    get historyIndex() {
      return historyIndex;
    },

    addToHistory<K extends HistoryActionType>(
      type: K,
      label: string,
      ...args: Extract<HistoryActionPayload, { type: K }>['payload'] extends undefined
        ? [payload?: never]
        : [payload: Extract<HistoryActionPayload, { type: K }>['payload']]
    ) {
      const entry = {
        type,
        label,
        payload: args[0],
        timestamp: nextTimestamp(),
      } as HistoryEntry;

      // Validate new imports before committing or discarding a valid redo branch.
      if (entry.type === 'import') {
        getImportTransition(entry.payload.source, entry.payload.role, imageData);
      }

      // remove any future history if we are in the middle of the stack
      if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
      }

      history.push(entry);
      historyIndex = history.length - 1;
      if (type === 'import-role') recomputeState();
      else applyEntry(entry);
      return entry;
    },

    undo() {
      if (historyIndex >= 0) {
        historyIndex--;
        recomputeState();
      }
    },

    redo() {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        recomputeState();
      }
    },

    jumpTo(index: number) {
      if (index >= -1 && index < history.length) {
        historyIndex = index;
        recomputeState();
      }
    },

    addAnnotationFile(file: AnnotationFile) {
      // clone file to ensure history is immutable
      this.addToHistory('annotation', `Add ${file.name}`, {
        action: 'add',
        file: { ...file },
        layerId: crypto.randomUUID(),
      });
    },

    toggleAnnotationFile(layerId: string) {
      const file = annotationFiles.find((f) => f.id === layerId);
      if (file) {
        const visible = !file.visible;
        this.addToHistory('visibility', `${visible ? 'Show' : 'Hide'} ${file.name}`, {
          layerId,
          visible,
        });
      }
    },

    removeAnnotationFile(layerId: string) {
      const file = annotationFiles.find((f) => f.id === layerId);
      if (!file) return;
      this.addToHistory('annotation', `Remove ${file.name}`, { action: 'remove', layerId });
    },

    setAnnotationCoordinateSpace(layerId: string, coordinateSpace: ImageCoordinateSpace) {
      const file = annotationFiles.find((f) => f.id === layerId);
      if (!file || file.coordinateSpace === coordinateSpace) return;
      this.addToHistory('coordinates', `Use ${coordinateSpace} coordinates for ${file.name}`, {
        layerId,
        coordinateSpace,
      });
    },

    setImage(data: ImageData, name: string) {
      this.addToHistory('image', 'Load Image', { data, name, imageId: crypto.randomUUID() });
    },

    setMask(data: ImageData) {
      this.addToHistory('mask', 'Load Mask', { data });
    },

    setRasterPreview(target: RasterTarget, settings: RasterPreviewSettings) {
      const data = target === 'image' ? imageData : maskData;
      if (!data?.raster) return;
      const preview = withRasterPreview(data, settings);
      this.addToHistory('raster-preview', `Use ${settings.mode} preview for ${target}`, {
        target,
        data: preview,
      });
    },

    setLineWidth(value: number) {
      drawSettings.lineWidth = value;
    },

    setShowLabels(value: boolean) {
      drawSettings.showLabels = value;
    },

    setDisplaySettings(settings: Partial<DisplaySettings>) {
      Object.assign(displaySettings, settings);
    },

    getClassColor(className: string): string {
      const override = classColors.get(className);
      if (override !== undefined) {
        return override;
      }

      // rendering calls this lookup, so fallback colors must not mutate reactive state
      const hash = className.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
      const hue = (hash * 137.5) % 360;
      return `hsl(${hue}, 70%, 50%)`;
    },

    setClassColor(className: string, color: string) {
      classColors.set(className, color);
    },

    recalculateLineStroke(zoomX: number, zoomY: number) {
      drawSettings.lineWidth = calculateStrokeWitdth(zoomX, zoomY);
    },

    clearAll(recordHistory = true) {
      if (recordHistory) {
        this.addToHistory('clear', 'Clear All');
      } else {
        applyAction({ type: 'clear' });
      }
    },

    clearHistory() {
      // Keep the visible document as the starting point for all future replay.
      historyBaseline = captureDocument();
      history = [];
      historyIndex = -1;
      historyErrors = {};
      roleErrors = {};
      failedImports = [];
    },

    reorderHistory(newHistory: HistoryEntry[]) {
      const currentActiveItem = history[historyIndex];
      history = newHistory;
      // we need to find where the active item moved to
      if (currentActiveItem) {
        const newIndex = history.findIndex(
          (item) => item.timestamp === currentActiveItem.timestamp,
        );
        historyIndex = newIndex !== -1 ? newIndex : -1;
      } else {
        historyIndex = -1;
      }
      recomputeState();
    },
  };

  setContext(CONTEXT_KEY, context);
  return context;
}

function calculateStrokeWitdth(stageZoomX: number, stageZoomY: number) {
  const DEFAULT_SIZE = 1.5;
  const zoom = stageZoomX * stageZoomY;

  const boost = Math.min(1 / zoom, 10);

  return Math.max(DEFAULT_SIZE, DEFAULT_SIZE * boost);
}

export type CanvasContext = ReturnType<typeof createCanvasContext>;

export function getCanvasContext() {
  return getContext<CanvasContext>(CONTEXT_KEY);
}

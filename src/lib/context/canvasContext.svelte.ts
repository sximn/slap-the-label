import { setContext, getContext } from 'svelte';
import type {
  DrawSettings,
  ImageData,
  AnnotationFile,
  DisplaySettings,
  ImageCoordinateSpace,
} from '$lib/types';
import { SvelteMap } from 'svelte/reactivity';

const CONTEXT_KEY = Symbol('CANVAS');

export type HistoryActionPayload =
  | { type: 'image'; payload: { data: ImageData; name: string } }
  | { type: 'mask'; payload: { data: ImageData } }
  | {
      type: 'annotation';
      payload: { action: 'add'; file: AnnotationFile } | { action: 'remove'; name: string };
    }
  | { type: 'visibility'; payload: { name: string; visible: boolean } }
  | { type: 'coordinates'; payload: { name: string; coordinateSpace: ImageCoordinateSpace } }
  | { type: 'clear'; payload?: never };

export type HistoryActionType = HistoryActionPayload['type'];

export type HistoryEntry = HistoryActionPayload & {
  label: string;
  timestamp: number;
};

export function createCanvasContext() {
  let imageData = $state<ImageData | null>(null);
  let imageFileName = $state<string>('');

  let maskData = $state<ImageData | null>(null);
  let annotationFiles = $state<AnnotationFile[]>([]);
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

  function cloneAnnotationFiles(files: AnnotationFile[]) {
    return structuredClone($state.snapshot(files));
  }

  function captureDocument() {
    return {
      imageData,
      imageFileName,
      maskData,
      annotationFiles: cloneAnnotationFiles(annotationFiles),
      classColors: new Map(classColors),
      drawSettings: { ...drawSettings },
    };
  }

  function restoreBaseline() {
    imageData = historyBaseline.imageData;
    imageFileName = historyBaseline.imageFileName;
    maskData = historyBaseline.maskData;
    annotationFiles = cloneAnnotationFiles(historyBaseline.annotationFiles);
    classColors = new SvelteMap(historyBaseline.classColors);
    Object.assign(drawSettings, historyBaseline.drawSettings);
  }

  function resetDocument() {
    imageData = null;
    imageFileName = '';
    maskData = null;
    annotationFiles = [];
    classColors = new SvelteMap();

    drawSettings.lineWidth = 2;
    drawSettings.showLabels = true;
  }

  function applyAction(action: HistoryActionPayload) {
    switch (action.type) {
      case 'image':
        resetDocument();
        imageData = action.payload.data;
        imageFileName = action.payload.name;
        break;

      case 'mask':
        maskData = action.payload.data;
        break;

      case 'annotation': {
        const { payload } = action;
        if (payload.action === 'add') {
          // clone to avoid mutating the history entry when visibility changes
          annotationFiles.push({ ...payload.file });
        } else {
          annotationFiles = annotationFiles.filter((f) => f.name !== payload.name);
        }
        break;
      }

      case 'visibility': {
        const { payload } = action;
        const file = annotationFiles.find((f) => f.name === payload.name);
        if (file) {
          file.visible = payload.visible;
        }
        break;
      }

      case 'clear':
        resetDocument();
        break;

      case 'coordinates': {
        const file = annotationFiles.find((f) => f.name === action.payload.name);
        if (file) file.coordinateSpace = action.payload.coordinateSpace;
        break;
      }
    }
  }

  function recomputeState() {
    restoreBaseline();

    for (let i = 0; i <= historyIndex; i++) {
      const entry = history[i];
      if (entry) applyAction(entry);
    }
  }

  const context = {
    get imageData() {
      return imageData;
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
      // remove any future history if we are in the middle of the stack
      if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
      }

      const entry = {
        type,
        label,
        payload: args[0],
        timestamp: Date.now(),
      } as HistoryEntry;

      applyAction(entry);

      history.push(entry);
      historyIndex = history.length - 1;
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
      this.addToHistory('annotation', `Add ${file.name}`, { action: 'add', file: { ...file } });
    },

    toggleAnnotationFile(fileName: string) {
      const file = annotationFiles.find((f) => f.name === fileName);
      if (file) {
        const visible = !file.visible;
        this.addToHistory('visibility', `${visible ? 'Show' : 'Hide'} ${fileName}`, {
          name: fileName,
          visible,
        });
      }
    },

    removeAnnotationFile(fileName: string) {
      this.addToHistory('annotation', `Remove ${fileName}`, { action: 'remove', name: fileName });
    },

    setAnnotationCoordinateSpace(fileName: string, coordinateSpace: ImageCoordinateSpace) {
      const file = annotationFiles.find((f) => f.name === fileName);
      if (!file || file.coordinateSpace === coordinateSpace) return;
      this.addToHistory('coordinates', `Use ${coordinateSpace} coordinates for ${fileName}`, {
        name: fileName,
        coordinateSpace,
      });
    },

    setImage(data: ImageData, name: string) {
      this.addToHistory('image', 'Load Image', { data, name });
    },

    setMask(data: ImageData) {
      this.addToHistory('mask', 'Load Mask', { data });
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
      if (!classColors.has(className)) {
        // generate a random color or consistent hash color for new classes
        const hash = className.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
        const hue = (hash * 137.5) % 360;
        classColors.set(className, `hsl(${hue}, 70%, 50%)`);
      }
      return classColors.get(className)!;
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

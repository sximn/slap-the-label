import { setContext, getContext } from 'svelte';
import type { DrawSettings, ImageData, AnnotationFile, DisplaySettings } from '$lib/types';
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

  function recomputeState() {
    // reset tracked state to defaults
    imageData = null;
    imageFileName = '';
    maskData = null;
    annotationFiles = [];
    classColors = new Map();
    // reset drawSettings only if a 'clear' action is encountered

    for (let i = 0; i <= historyIndex; i++) {
      const entry = history[i];
      if (!entry) continue;

      switch (entry.type) {
        case 'image': {
          const { payload } = entry;
          imageData = payload.data;
          imageFileName = payload.name;
          break;
        }
        case 'mask': {
          const { payload } = entry;
          maskData = payload.data;
          break;
        }
        case 'annotation': {
          const { payload } = entry;
          if (payload.action === 'add') {
            // clone to avoid mutating history entry
            annotationFiles.push({ ...payload.file });
          } else {
            annotationFiles = annotationFiles.filter((f) => f.name !== payload.name);
          }
          break;
        }
        case 'visibility': {
          const { payload } = entry;
          const file = annotationFiles.find((f) => f.name === payload.name);
          if (file) {
            file.visible = payload.visible;
          }
          break;
        }
        case 'clear':
          imageData = null;
          imageFileName = '';
          maskData = null;
          annotationFiles = [];
          classColors = new Map();
          drawSettings.lineWidth = 2;
          drawSettings.showLabels = true;
          break;
      }
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

      history.push({
        type,
        label,
        payload: args[0],
        timestamp: Date.now(),
      } as HistoryEntry);
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
      annotationFiles.push(file);
      // clone file to ensure history is immutable
      this.addToHistory('annotation', `Add ${file.name}`, { action: 'add', file: { ...file } });
    },

    toggleAnnotationFile(fileName: string) {
      const file = annotationFiles.find((f) => f.name === fileName);
      if (file) {
        file.visible = !file.visible;
        this.addToHistory('visibility', `${file.visible ? 'Show' : 'Hide'} ${fileName}`, {
          name: fileName,
          visible: file.visible,
        });
      }
    },

    removeAnnotationFile(fileName: string) {
      annotationFiles = annotationFiles.filter((f) => f.name !== fileName);
      this.addToHistory('annotation', `Remove ${fileName}`, { action: 'remove', name: fileName });
    },

    setImage(data: ImageData, name: string) {
      // clearAll resets everything but doesn't record history here because we proceed to adding 'image' action
      this.clearAll(false);
      imageData = data;
      imageFileName = name;
      this.addToHistory('image', 'Load Image', { data, name });
    },

    setMask(data: ImageData) {
      maskData = data;
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
      imageData = null;
      imageFileName = '';
      maskData = null;
      annotationFiles = [];
      classColors = new Map();
      drawSettings.lineWidth = 2;
      drawSettings.showLabels = true;

      if (recordHistory) {
        this.addToHistory('clear', 'Clear All');
      }
    },

    clearHistory() {
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

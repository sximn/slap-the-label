import { expect, test } from 'vitest';
import type { CanvasContext } from '$lib/context/canvasContext.svelte';
import type { AnnotationFile } from '$lib/types';
import { createContext, image } from './helpers/canvasContext';

const labels: AnnotationFile = {
  name: 'labels.txt',
  visible: true,
  color: '#ff0000',
  annotations: [{ type: 'bbox', class: 'object', x: 0.5, y: 0.5, w: 0.2, h: 0.2 }],
};

const polygons: AnnotationFile = {
  name: 'polygons.geojson',
  visible: true,
  color: '#00ff00',
  annotations: [{ type: 'polygon', points: [0, 0, 1, 0, 1, 1] }],
};

function loadAnnotatedImage(context: CanvasContext) {
  context.setImage(image(100), 'A.png');
  context.addAnnotationFile(labels);
  context.addAnnotationFile(polygons);
  context.setMask(image(100));
}

function assertImageA(context: CanvasContext) {
  expect(context.imageFileName).toBe('A.png');
  expect(context.imageData?.width).toBe(100);
  expect(context.annotationFiles).toEqual([labels, polygons]);
  expect(context.maskData?.width).toBe(100);
}

function assertCleanImage(context: CanvasContext, name: string, width: number) {
  expect(context.imageFileName).toBe(name);
  expect(context.imageData?.width).toBe(width);
  expect(context.annotationFiles).toEqual([]);
  expect(context.maskData).toBe(null);
  expect(context.classColors.size).toBe(0);
  expect(context.drawSettings).toEqual({ lineWidth: 2, showLabels: true });
}

test('class color lookup is deterministic without mutating reactive state during rendering', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.setDisplaySettings({ colorMode: 'class' });
  const colorsBefore = new Map(context.classColors);

  const color = context.getClassColor('object');
  expect(color).toMatch(/^hsl\([\d.]+, 70%, 50%\)$/);
  expect(context.getClassColor('object')).toBe(color);
  expect(createContext().getClassColor('object')).toBe(color);
  expect(new Map(context.classColors)).toEqual(colorsBefore);

  context.clearAll();
  context.undo();
  expect(context.getClassColor('object')).toBe(color);
  expect(context.classColors.size).toBe(0);
});

test('class color lookup honors explicit overrides without storing other fallback colors', () => {
  const context = createContext();
  context.getClassColor('object');
  context.setClassColor('object', '#123456');

  expect(context.getClassColor('object')).toBe('#123456');
  context.getClassColor('other');
  expect([...context.classColors]).toEqual([['object', '#123456']]);

  context.setClassColor('object', '#abcdef');
  expect(context.getClassColor('object')).toBe('#abcdef');
});

test('image replacement is one undoable operation that clears overlays on every redo', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.setClassColor('object', '#123456');
  context.setLineWidth(7);
  context.setShowLabels(false);
  const previousHistoryLength = context.history.length;

  context.setImage(image(200), 'B.png');
  expect(context.history.length).toBe(previousHistoryLength + 1);
  expect(context.history.at(-1)?.type).toBe('image');
  assertCleanImage(context, 'B.png', 200);

  for (let i = 0; i < 3; i++) {
    context.undo();
    assertImageA(context);
    context.redo();
    assertCleanImage(context, 'B.png', 200);
  }
});

test('history jumps replay the same atomic image replacement', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.setImage(image(200), 'B.png');
  const replacementIndex = context.historyIndex;

  context.jumpTo(replacementIndex - 1);
  assertImageA(context);
  context.jumpTo(replacementIndex);
  assertCleanImage(context, 'B.png', 200);
  context.jumpTo(-1);
  expect(context.imageData).toBe(null);
  expect(context.maskData).toBe(null);
  expect(context.annotationFiles).toEqual([]);
  context.jumpTo(replacementIndex);
  assertCleanImage(context, 'B.png', 200);
});

test('replacing an image after undo discards the old redo branch', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.setImage(image(200), 'B.png');
  context.undo();
  context.setImage(image(300), 'C.png');

  assertCleanImage(context, 'C.png', 300);
  expect(context.history.filter((entry) => entry.type === 'image').length).toBe(2);
  context.undo();
  assertImageA(context);
  context.redo();
  assertCleanImage(context, 'C.png', 300);
  context.redo();
  assertCleanImage(context, 'C.png', 300);
});

test('annotation visibility, removal, and clear use the same transitions during replay', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.toggleAnnotationFile(labels.name);
  expect(context.annotationFiles[0].visible).toBe(false);
  expect(context.history[1]).toMatchObject({
    type: 'annotation',
    payload: { action: 'add', file: { visible: true } },
  });
  expect(labels.visible).toBe(true);
  context.undo();
  assertImageA(context);
  context.redo();
  expect(context.annotationFiles[0].visible).toBe(false);

  context.removeAnnotationFile(polygons.name);
  expect(context.annotationFiles.map((file) => file.name)).toEqual([labels.name]);
  context.undo();
  expect(context.annotationFiles.length).toBe(2);
  context.redo();
  expect(context.annotationFiles.length).toBe(1);

  context.clearAll();
  expect(context.imageData).toBe(null);
  expect(context.maskData).toBe(null);
  expect(context.annotationFiles).toEqual([]);
  context.undo();
  expect(context.imageFileName).toBe('A.png');
  expect(context.maskData?.width).toBe(100);
  expect(context.annotationFiles.length).toBe(1);
  context.redo();
  expect(context.imageData).toBe(null);
  expect(context.maskData).toBe(null);
  expect(context.annotationFiles).toEqual([]);
});

test('clearing history adopts the complete current document as the undo baseline', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.setClassColor('object', '#123456');
  context.setLineWidth(7);
  context.setShowLabels(false);
  context.clearHistory();

  expect(context.history).toEqual([]);
  expect(context.historyIndex).toBe(-1);
  assertImageA(context);
  context.undo();
  context.redo();
  assertImageA(context);

  for (let i = 0; i < 3; i++) {
    context.clearAll();
    expect(context.imageData).toBeNull();
    context.undo();
    assertImageA(context);
    expect(context.classColors.get('object')).toBe('#123456');
    expect(context.drawSettings).toEqual({ lineWidth: 7, showLabels: false });
    context.redo();
    expect(context.imageData).toBeNull();
    context.undo();
  }
});

test('baseline layers remain immutable across visibility changes and direct mutations', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.clearHistory();
  context.toggleAnnotationFile(labels.name);
  expect(context.annotationFiles[0].visible).toBe(false);
  context.undo();
  assertImageA(context);

  context.annotationFiles[0].color = '#abcdef';
  const polygon = context.annotationFiles[1].annotations[0];
  if (polygon.type === 'polygon') polygon.points[0] = 42;
  context.removeAnnotationFile(labels.name);
  context.jumpTo(-1);
  assertImageA(context);

  // Restoring the baseline must also create fresh copies on every replay.
  context.toggleAnnotationFile(labels.name);
  context.undo();
  assertImageA(context);
});

test('clearing history after undo discards the future and preserves the visible document', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.setImage(image(200), 'B.png');
  context.undo();
  context.clearHistory();
  context.redo();
  assertImageA(context);

  context.setImage(image(300), 'C.png');
  context.undo();
  assertImageA(context);
  context.redo();
  assertCleanImage(context, 'C.png', 300);
  context.clearHistory();
  context.clearAll();
  context.undo();
  assertCleanImage(context, 'C.png', 300);
});

test('clearing history on an empty pane establishes an empty baseline', () => {
  const context = createContext();
  loadAnnotatedImage(context);
  context.clearAll();
  context.clearHistory();
  context.setImage(image(200), 'B.png');
  context.undo();
  expect(context.imageData).toBeNull();
  expect(context.imageFileName).toBe('');
  expect(context.maskData).toBeNull();
  expect(context.annotationFiles).toEqual([]);
});

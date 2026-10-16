import { expect, test } from 'vitest';
import { render } from 'svelte/server';
import type { CanvasContext } from '$lib/context/canvasContext.svelte';
import type { AnnotationFile, ImageData } from '$lib/types';
import CanvasContextFixture from './fixtures/CanvasContext.svelte';

function createContext(): CanvasContext {
  let context: CanvasContext | undefined;
  // accessing body forces Svelte's lazy server render to initialize the component
  render(CanvasContextFixture, { props: { capture: (value) => (context = value) } }).body;

  if (!context) {
    throw new Error('Canvas context was not initialized');
  }

  return context;
}

const image = (width: number): ImageData => ({
  width,
  height: width,
  // these state tests never draw the canvas
  canvasElement: {} as HTMLCanvasElement,
});

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

import { expect, test } from 'vitest';
import type { AnnotationFile, ImportedSource } from '$lib/types';
import { createContext, image } from './helpers/canvasContext';

const annotationFile: AnnotationFile = {
  name: 'labels.txt',
  annotations: [{ type: 'bbox', class: '0', x: 0.5, y: 0.5, w: 0.2, h: 0.2 }],
  color: '#ff0000',
  visible: true,
};

async function importDuplicateLayers(format: 'yolo' | 'geojson') {
  const context = createContext();
  context.setImage(image(100), 'image.png');
  const file =
    format === 'yolo'
      ? new File(['0 0.5 0.5 0.2 0.2'], 'labels.txt')
      : new File(
          [
            JSON.stringify({
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [10, 0],
                    [10, 10],
                    [0, 0],
                  ],
                ],
              },
            }),
          ],
          'labels.geojson',
        );
  await context.importFiles([file, file], 'annotation');
  expect(context.importErrors).toEqual([]);
  expect(context.annotationFiles).toHaveLength(2);
  return context;
}

test.each(['yolo', 'geojson'] as const)(
  'duplicate %s filenames have independent visibility, coordinates, and removal',
  async (format) => {
    const context = await importDuplicateLayers(format);
    const [first, second] = context.annotationFiles;
    expect(first.id).toEqual(expect.any(String));
    expect(second.id).toEqual(expect.any(String));
    expect(first.id).not.toBe(second.id);

    context.toggleAnnotationFile(second.id);
    expect(context.annotationFiles.map((file) => file.visible)).toEqual([true, false]);
    context.undo();
    expect(context.annotationFiles.map((file) => file.visible)).toEqual([true, true]);
    context.redo();
    expect(context.annotationFiles.map((file) => file.visible)).toEqual([true, false]);

    context.setAnnotationCoordinateSpace(second.id, 'normalized');
    expect(context.annotationFiles.map((file) => file.coordinateSpace)).toEqual([
      first.coordinateSpace,
      'normalized',
    ]);
    context.undo();
    expect(context.annotationFiles.map((file) => file.coordinateSpace)).toEqual([
      first.coordinateSpace,
      first.coordinateSpace,
    ]);
    context.redo();
    expect(context.annotationFiles[1].coordinateSpace).toBe('normalized');

    context.removeAnnotationFile(second.id);
    expect(context.annotationFiles.map((file) => file.id)).toEqual([first.id]);
    context.undo();
    expect(context.annotationFiles.map((file) => file.id)).toEqual([first.id, second.id]);
    context.redo();
    expect(context.annotationFiles.map((file) => file.id)).toEqual([first.id]);
  },
);

test('layer IDs and action targets survive history jumps, reordering, and baseline capture', async () => {
  const context = await importDuplicateLayers('geojson');
  const [first, second] = context.annotationFiles;
  const importIndex = context.historyIndex;
  context.jumpTo(0);
  expect(context.annotationFiles).toEqual([]);
  context.jumpTo(importIndex);
  expect(context.annotationFiles.map((file) => file.id)).toEqual([first.id, second.id]);

  context.toggleAnnotationFile(second.id);
  context.setAnnotationCoordinateSpace(second.id, 'normalized');
  context.removeAnnotationFile(first.id);
  const reordered = [...context.history];
  [reordered[1], reordered[2]] = [reordered[2], reordered[1]];
  context.reorderHistory(reordered);
  expect(context.annotationFiles).toMatchObject([
    { id: second.id, visible: false, coordinateSpace: 'normalized' },
  ]);
  context.undo();
  expect(context.annotationFiles).toMatchObject([
    { id: second.id, visible: false, coordinateSpace: 'normalized' },
    { id: first.id, visible: true, coordinateSpace: 'pixel' },
  ]);

  context.clearHistory();
  context.removeAnnotationFile(second.id);
  expect(context.annotationFiles.map((file) => file.id)).toEqual([first.id]);
  context.undo();
  expect(context.annotationFiles.map((file) => file.id)).toEqual([second.id, first.id]);
  context.clearAll();
  context.undo();
  expect(context.annotationFiles.map((file) => file.id)).toEqual([second.id, first.id]);
});

test('each add gets a new layer ID even when reusing the same decoded source or layer', () => {
  const context = createContext();
  context.setImage(image(100), 'image.png');
  const source: ImportedSource = {
    kind: 'annotation',
    format: 'yolo',
    name: annotationFile.name,
    annotationFile,
  };
  expect(context.addImport(source, 'annotation')).toBeUndefined();
  expect(context.addImport(source, 'annotation')).toBeUndefined();
  context.addAnnotationFile(context.annotationFiles[0]);
  const ids = context.annotationFiles.map((file) => file.id);
  expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(3);
  context.undo();
  context.redo();
  expect(context.annotationFiles.map((file) => file.id)).toEqual(ids);
});

test('correcting a failed annotation import creates a distinct stable layer ID', async () => {
  const context = await importDuplicateLayers('yolo');
  const existingIds = context.annotationFiles.map((file) => file.id);
  await context.importFiles([new File(['0 0.5 0.5 0.2 0.2'], 'labels.txt')], 'image');
  const attempt = context.failedImports[0];
  context.changeImportRole(attempt.timestamp, 'annotation');
  const added = context.annotationFiles[2];
  expect(added.id).toEqual(expect.any(String));
  expect(existingIds).not.toContain(added.id);
  context.undo();
  context.redo();
  expect(context.annotationFiles.map((file) => file.id)).toEqual([...existingIds, added.id]);
  context.removeAnnotationFile(added.id);
  expect(context.annotationFiles.map((file) => file.id)).toEqual(existingIds);
});

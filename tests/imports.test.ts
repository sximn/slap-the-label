import { beforeEach, expect, test, vi } from 'vitest';
import type { ImportRole } from '$lib/types';
import { importFile, importFiles } from '$lib/utils/files/loader';
import { loadImage } from '$lib/utils/files/imageLoader';
import { createContext, image } from './helpers/canvasContext';

vi.mock('$lib/utils/files/imageLoader', () => ({ loadImage: vi.fn() }));
const decode = vi.mocked(loadImage);
const rasterFile = new File(['raster'], 'mask.png', { type: 'image/png' });
const labels = (name: string) => new File(['0 0.5 0.5 0.2 0.2'], name);

function documentWithOverlays() {
  const context = createContext();
  context.setImage(image(100), 'base.png');
  context.addAnnotationFile({
    name: 'existing.txt',
    visible: true,
    color: '#ff0000',
    annotations: [],
  });
  context.setMask(image(100));
  return context;
}

beforeEach(() => {
  decode.mockReset();
  decode.mockResolvedValue({ imageData: image(100) });
});

test.each<ImportRole>(['image', 'mask'])(
  'the chosen %s role controls the operation for the same raster file',
  async (role) => {
    const context = documentWithOverlays();
    const originalImage = context.imageData;
    const imported = image(100);
    decode.mockResolvedValue({ imageData: imported });

    await importFile(rasterFile, context, role);

    if (role === 'mask') {
      expect(context.imageData).toBe(originalImage);
      expect(context.imageFileName).toBe('base.png');
      expect(context.annotationFiles).toHaveLength(1);
      expect(context.maskData).toBe(imported);
    } else {
      expect(context.imageData).toBe(imported);
      expect(context.imageFileName).toBe('mask.png');
      expect(context.annotationFiles).toEqual([]);
      expect(context.maskData).toBeNull();
    }
    expect(context.history.at(-1)?.type).toBe('import');
    expect(context.getImportRole(context.history.at(-1)!.timestamp)).toBe(role);
  },
);

test('mismatched masks report the filename and dimensions without changing any document state', async () => {
  const context = documentWithOverlays();
  const originalImage = context.imageData;
  const originalMask = context.maskData;
  const originalHistory = [...context.history];
  decode.mockResolvedValue({ imageData: image(50) });

  await context.importFiles([rasterFile], 'mask');

  expect(context.importErrors).toEqual([
    expect.stringContaining('mask.png: Mask dimensions 50×50'),
  ]);
  expect(context.importErrors[0]).toContain('100×100');
  expect(context.isImporting).toBe(false);
  expect(context.imageData).toBe(originalImage);
  expect(context.maskData).toBe(originalMask);
  expect(context.annotationFiles).toHaveLength(1);
  expect(context.history).toEqual(originalHistory);
  expect(context.failedImports).toHaveLength(1);
  expect(context.getHistoryError(context.failedImports[0].timestamp)).toContain('Mask dimensions');
  context.dismissImportErrors();
  expect(context.importErrors).toEqual([]);
});

test.each([undefined, 'mask'] as const)(
  'a failed %s mask import after undo preserves the complete redo branch',
  async (role) => {
    const context = createContext();
    const imageA = image(100);
    const imageB = image(200);
    decode.mockResolvedValueOnce({ imageData: imageA });
    await context.importFiles([new File(['A'], 'A.png')], 'image');
    decode.mockResolvedValueOnce({ imageData: imageB });
    await context.importFiles([new File(['B'], 'B.png')], 'image');
    context.undo();
    const history = [...context.history];
    const historyIndex = context.historyIndex;
    decode.mockResolvedValue({ imageData: image(50) });

    await context.importFiles([rasterFile], role);

    expect(context.importErrors[0]).toContain('Mask dimensions 50×50');
    expect(context.history).toEqual(history);
    expect(context.historyIndex).toBe(historyIndex);
    expect(context.imageData).toBe(imageA);
    expect(context.failedImports).toHaveLength(1);
    context.redo();
    expect(context.imageData).toBe(imageB);
    expect(context.imageFileName).toBe('B.png');
    context.undo();
    expect(context.imageData).toBe(imageA);
  },
);

test.each<ImportRole>(['mask', 'annotation'])(
  '%s requires an image and cannot silently replace the document',
  async (role) => {
    const context = createContext();
    await expect(
      importFile(role === 'annotation' ? labels('labels.txt') : rasterFile, context, role),
    ).rejects.toThrow('Add an image');
    expect(context.imageData).toBeNull();
    expect(context.annotationFiles).toEqual([]);
    expect(context.history).toHaveLength(0);
    expect(context.failedImports).toHaveLength(1);
  },
);

test('omitting the role uses an inferred default that remains editable in history', async () => {
  const context = documentWithOverlays();
  await importFile(rasterFile, context);
  expect(context.getImportRole(context.history.at(-1)!.timestamp)).toBe('mask');
  expect(context.imageFileName).toBe('base.png');
  expect(context.history).toHaveLength(4);
});

test.each([
  { pixels: [0, 0, 0, 255, 128, 128, 128, 255], expected: 'mask' },
  { pixels: [255, 0, 0, 255, 0, 0, 255, 255], expected: 'image' },
])('matching raster appearance defaults to $expected', async ({ pixels, expected }) => {
  const context = documentWithOverlays();
  const data = image(100);
  data.canvasElement = {
    getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(pixels) }) }),
  } as unknown as HTMLCanvasElement;
  decode.mockResolvedValue({ imageData: data });
  await context.importFiles([new File(['image'], 'unclassified.png')]);
  expect(context.getImportRole(context.history.at(-1)!.timestamp)).toBe(expected);
});

test('files incompatible with the explicit role are rejected without falling back to image replacement', async () => {
  const context = documentWithOverlays();
  await expect(importFile(labels('labels.txt'), context, 'image')).rejects.toThrow(
    'not raster pixels',
  );
  await expect(importFile(rasterFile, context, 'annotation')).rejects.toThrow(
    'not YOLO or GeoJSON',
  );
  expect(decode).toHaveBeenCalledOnce();
  expect(context.imageFileName).toBe('base.png');
  expect(context.annotationFiles).toHaveLength(1);
  expect(context.history).toHaveLength(3);
  expect(context.failedImports).toHaveLength(2);
});

test('GeoJSON and YOLO with missing or generic MIME types use the annotation role', async () => {
  const context = documentWithOverlays();
  const geojson = new File(
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
    'polygons.geojson',
    { type: 'application/octet-stream' },
  );
  const result = await importFiles([geojson, labels('labels.txt')], context, 'annotation');
  expect(result).toEqual({ imported: 2, errors: [] });
  expect(context.annotationFiles.map((file) => file.name)).toEqual([
    'existing.txt',
    'polygons.geojson',
    'labels.txt',
  ]);
  expect(context.imageFileName).toBe('base.png');
  expect(decode).not.toHaveBeenCalled();
});

test('TIFF images with no MIME type are accepted in the explicit image role', async () => {
  const context = createContext();
  await importFile(new File(['raster'], 'image.TIFF'), context, 'image');
  expect(decode).toHaveBeenCalledOnce();
  expect(context.imageFileName).toBe('image.TIFF');
});

test.each<ImportRole>(['image', 'mask'])(
  'multi-file %s requests reject the whole batch before replacing anything',
  async (role) => {
    const context = documentWithOverlays();
    const result = await importFiles([rasterFile, rasterFile], context, role);
    expect(result.imported).toBe(0);
    expect(result.errors[0]).toContain(`one ${role} at a time`);
    expect(decode).not.toHaveBeenCalled();
    expect(context.imageFileName).toBe('base.png');
    expect(context.history).toHaveLength(3);
  },
);

test('decode errors reach the shared application error state and allow a subsequent import', async () => {
  const context = documentWithOverlays();
  decode.mockRejectedValueOnce(new Error('Corrupt raster'));
  await context.importFiles([rasterFile], 'mask');
  expect(context.importErrors).toEqual(['mask.png: Corrupt raster']);
  expect(context.imageFileName).toBe('base.png');
  expect(context.history).toHaveLength(3);
  await context.importFiles([rasterFile], 'mask');
  expect(context.importErrors).toEqual([]);
  expect(context.getImportRole(context.history.at(-1)!.timestamp)).toBe('mask');
});

test('annotation batches import each file once and report individual failures', async () => {
  const context = documentWithOverlays();
  await context.importFiles(
    [labels('first.txt'), new File(['bad'], 'bad.txt'), labels('last.txt')],
    'annotation',
  );
  expect(context.annotationFiles.map((file) => file.name)).toEqual([
    'existing.txt',
    'first.txt',
    'last.txt',
  ]);
  expect(context.importErrors).toEqual([expect.stringContaining('bad.txt:')]);
  expect(context.history).toHaveLength(5);
});

test('a slow mask decode cannot attach itself to a replacement image', async () => {
  const context = documentWithOverlays();
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof loadImage>>>();
  decode.mockReturnValue(pending.promise);
  const importing = context.importFiles([rasterFile], 'mask');
  expect(context.isImporting).toBe(true);
  context.setImage(image(100), 'replacement.png');
  pending.resolve({ imageData: image(100) });
  await importing;
  expect(context.importErrors[0]).toContain('image changed during import');
  expect(context.imageFileName).toBe('replacement.png');
  expect(context.maskData).toBeNull();
  expect(context.history).toHaveLength(4);
});

test('a slow annotation read cannot attach itself after clearing the document', async () => {
  const context = documentWithOverlays();
  const pending = Promise.withResolvers<string>();
  const file = labels('slow.txt');
  vi.spyOn(file, 'text').mockReturnValue(pending.promise);
  const importing = context.importFiles([file, labels('remaining.txt')], 'annotation');
  context.clearAll();
  pending.resolve('0 0.5 0.5 0.2 0.2');
  await importing;
  expect(context.importErrors[0]).toContain('image changed during import');
  expect(context.imageData).toBeNull();
  expect(context.annotationFiles).toEqual([]);
  expect(context.importErrors.at(-1)).toContain('Remaining files were not imported');
});

test('changing an inferred replacement image to a mask restores the prior image and overlays', async () => {
  const context = documentWithOverlays();
  const originalImage = context.imageData;
  const replacement = image(100);
  decode.mockResolvedValue({ imageData: replacement });
  await context.importFiles([new File(['image'], 'replacement.png')]);
  const id = context.history.at(-1)!.timestamp;
  expect(context.getImportRole(id)).toBe('image');
  expect(context.imageData).toBe(replacement);
  expect(context.annotationFiles).toEqual([]);

  context.changeImportRole(id, 'mask');
  expect(context.getImportRole(id)).toBe('mask');
  expect(context.imageData).toBe(originalImage);
  expect(context.imageFileName).toBe('base.png');
  expect(context.annotationFiles[0].name).toBe('existing.txt');
  expect(context.maskData).toBe(replacement);

  context.undo();
  expect(context.getImportRole(id)).toBe('image');
  expect(context.imageData).toBe(replacement);
  expect(context.annotationFiles).toEqual([]);
  context.redo();
  expect(context.getImportRole(id)).toBe('mask');
  expect(context.imageData).toBe(originalImage);
  expect(context.annotationFiles).toHaveLength(1);
  expect(decode).toHaveBeenCalledOnce();
});

test('changing a mask to an image replays a replacement and can be undone', async () => {
  const context = documentWithOverlays();
  await context.importFiles([rasterFile]);
  const id = context.history.at(-1)!.timestamp;
  context.changeImportRole(id, 'image');
  expect(context.imageFileName).toBe('mask.png');
  expect(context.annotationFiles).toEqual([]);
  expect(context.maskData).toBeNull();
  context.undo();
  expect(context.imageFileName).toBe('base.png');
  expect(context.annotationFiles).toHaveLength(1);
  expect(context.maskData).not.toBeNull();
});

test('incompatible reinterpretation keeps the chosen role and document, with an inline reason', async () => {
  const context = documentWithOverlays();
  await context.importFiles([rasterFile]);
  const id = context.history.at(-1)!.timestamp;
  const originalImage = context.imageData;
  const originalMask = context.maskData;
  const historyLength = context.history.length;
  context.changeImportRole(id, 'annotation');
  expect(context.getImportRole(id)).toBe('mask');
  expect(context.getHistoryError(id)).toContain('raster pixels, not YOLO or GeoJSON');
  expect(context.imageData).toBe(originalImage);
  expect(context.maskData).toBe(originalMask);
  expect(context.history).toHaveLength(historyLength);
  context.changeImportRole(id, 'mask');
  expect(context.getHistoryError(id)).toBeUndefined();
});

test('a failed inferred mask can be corrected without rereading and commits one undoable import', async () => {
  const context = documentWithOverlays();
  const originalHistory = [...context.history];
  decode.mockResolvedValue({ imageData: image(50) });
  await context.importFiles([rasterFile]);
  const id = context.failedImports[0].timestamp;
  expect(context.getImportRole(id)).toBe('mask');
  expect(context.getHistoryError(id)).toContain('50×50');
  expect(context.imageFileName).toBe('base.png');
  expect(context.history).toEqual(originalHistory);

  context.changeImportRole(id, 'image');
  expect(context.imageFileName).toBe('mask.png');
  expect(context.imageData?.width).toBe(50);
  expect(context.getHistoryError(id)).toBeUndefined();
  expect(context.importErrors).toEqual([]);
  expect(context.failedImports).toEqual([]);
  expect(context.history).toHaveLength(originalHistory.length + 1);
  expect(context.history.at(-1)?.type).toBe('import');
  expect(context.getImportRole(context.history.at(-1)!.timestamp)).toBe('image');
  expect(decode).toHaveBeenCalledOnce();
  context.undo();
  expect(context.imageFileName).toBe('base.png');
  expect(context.annotationFiles[0].name).toBe('existing.txt');
  context.redo();
  expect(context.imageFileName).toBe('mask.png');
  expect(context.imageData?.width).toBe(50);
});

test('only a successful correction of a failed import replaces the redo branch', async () => {
  const context = documentWithOverlays();
  context.setImage(image(200), 'B.png');
  context.undo();
  const history = [...context.history];
  const historyIndex = context.historyIndex;
  decode.mockResolvedValue({ imageData: image(50) });
  await context.importFiles([rasterFile], 'mask');
  const id = context.failedImports[0].timestamp;

  context.changeImportRole(id, 'annotation');
  expect(context.getHistoryError(id)).toContain('raster pixels');
  expect(context.history).toEqual(history);
  expect(context.historyIndex).toBe(historyIndex);
  expect(context.failedImports).toHaveLength(1);
  expect(context.getImportRole(id)).toBe('mask');

  context.changeImportRole(id, 'image');
  expect(context.failedImports).toEqual([]);
  expect(context.history).toHaveLength(historyIndex + 2);
  expect(context.history.some((entry) => entry.timestamp === history.at(-1)!.timestamp)).toBe(
    false,
  );
  expect(context.imageFileName).toBe('mask.png');
  context.undo();
  expect(context.imageFileName).toBe('base.png');
  context.redo();
  expect(context.imageFileName).toBe('mask.png');
  expect(decode).toHaveBeenCalledOnce();
});

test('failed imports validate retries against the current image and allow retrying the same role', async () => {
  const context = createContext();
  await context.importFiles([rasterFile], 'mask');
  const id = context.failedImports[0].timestamp;
  expect(context.getImportRoleError(id, 'mask')).toContain('Add an image');
  context.setImage(image(50), 'small.png');
  expect(context.getImportRoleError(id, 'mask')).toContain('100×100');
  context.setImage(image(100), 'matching.png');
  expect(context.getImportRoleError(id, 'mask')).toBeUndefined();

  context.changeImportRole(id, 'mask');
  expect(context.failedImports).toEqual([]);
  expect(context.maskData?.width).toBe(100);
  expect(context.history).toHaveLength(3);
  expect(decode).toHaveBeenCalledOnce();
});

test('clearing history releases failed decoded imports and their errors', async () => {
  const context = createContext();
  await context.importFiles([rasterFile], 'mask');
  const id = context.failedImports[0].timestamp;
  context.changeImportRole(id, 'annotation');
  context.clearHistory();

  expect(context.failedImports).toEqual([]);
  expect(context.history).toEqual([]);
  expect(context.getHistoryError(id)).toBeUndefined();
  expect(context.getImportRole(id)).toBeUndefined();
});

test('annotation files infer their role and explain incompatible image interpretations', async () => {
  const context = documentWithOverlays();
  await context.importFiles([labels('objects.txt')]);
  const id = context.history.at(-1)!.timestamp;
  expect(context.getImportRole(id)).toBe('annotation');
  context.changeImportRole(id, 'image');
  expect(context.getHistoryError(id)).toContain('YOLO text, not raster pixels');
  expect(context.getImportRole(id)).toBe('annotation');
  expect(context.annotationFiles).toHaveLength(2);
  expect(context.imageFileName).toBe('base.png');
});

test('the first image cannot be reinterpreted as a mask without a preceding image', async () => {
  const context = createContext();
  await context.importFiles([rasterFile]);
  const id = context.history.at(-1)!.timestamp;
  expect(context.getImportRole(id)).toBe('image');
  context.changeImportRole(id, 'mask');
  expect(context.getHistoryError(id)).toContain('Add an image');
  expect(context.getImportRole(id)).toBe('image');
  expect(context.imageFileName).toBe('mask.png');
});

test('role availability uses the original history position without mutating the current document', async () => {
  const context = documentWithOverlays();
  await context.importFiles([rasterFile]);
  const id = context.history.at(-1)!.timestamp;
  context.setImage(image(50), 'later.png');
  const currentImage = context.imageData;
  const annotations = context.annotationFiles;
  const historyLength = context.history.length;

  expect(context.getImportRoleError(id, 'mask')).toBeUndefined();
  expect(context.getImportRoleError(id, 'image')).toBeUndefined();
  expect(context.getImportRoleError(id, 'annotation')).toContain('raster pixels');
  expect(context.imageData).toBe(currentImage);
  expect(context.annotationFiles).toBe(annotations);
  expect(context.history).toHaveLength(historyLength);

  context.jumpTo(2);
  expect(context.getImportRoleError(id, 'mask')).toContain('Redo this history step');
});

test('role availability respects a cleared-history baseline and later clears', async () => {
  const context = documentWithOverlays();
  context.clearHistory();
  await context.importFiles([rasterFile]);
  const firstId = context.history.at(-1)!.timestamp;
  expect(context.getImportRoleError(firstId, 'mask')).toBeUndefined();
  decode.mockResolvedValueOnce({ imageData: image(50) });
  await context.importFiles([new File(['image'], 'smaller.png')]);
  const secondId = context.history.at(-1)!.timestamp;
  expect(context.getImportRoleError(secondId, 'mask')).toContain('100×100');

  context.changeImportRole(secondId, 'image');
  context.clearAll();
  await context.importFiles([rasterFile]);
  expect(context.getImportRoleError(context.history.at(-1)!.timestamp, 'mask')).toContain(
    'Add an image',
  );
});

test('one automatic batch can load an image, mask, and annotations with unique history identities', async () => {
  const context = createContext();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100);
  try {
    await context.importFiles([new File(['image'], 'base.png'), rasterFile, labels('objects.txt')]);
  } finally {
    clock.mockRestore();
  }
  expect(context.importErrors).toEqual([]);
  expect(context.history.map((entry) => context.getImportRole(entry.timestamp))).toEqual([
    'image',
    'mask',
    'annotation',
  ]);
  expect(new Set(context.history.map((entry) => entry.timestamp)).size).toBe(3);
  expect(context.imageFileName).toBe('base.png');
  expect(context.maskData).not.toBeNull();
  expect(context.annotationFiles).toHaveLength(1);
});

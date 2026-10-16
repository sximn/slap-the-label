import { expect, test, vi } from 'vitest';
import { decodeTiff } from '$lib/utils/files/tiffDecoder';
import { createRasterPreview, defaultRasterPreview } from '$lib/utils/rasterPreview';
import { loadImage, processImageFile } from '$lib/utils/files/imageLoader';
import { createContext, image } from './helpers/canvasContext';
import { tiffFixture } from './helpers/tiffFixture';

vi.mock('$lib/utils/canvasDrawer', () => ({
  imageDataToCanvas: vi.fn((rgba: Uint8ClampedArray, width: number, height: number) => ({
    width,
    height,
    rgba: rgba.slice(),
  })),
}));

const tiffFile = (buffer: ArrayBuffer) => new File([buffer], 'image.tif', { type: 'image/tiff' });

test('white-is-zero changes only the preview polarity, preserving decoded samples and tags', async () => {
  const buffer = tiffFixture({ width: 2, height: 1, values: [0, 255], photometric: 0 });
  const raster = await decodeTiff(buffer);
  expect(raster.bands[0]).toBeInstanceOf(Uint8Array);
  expect([...raster.bands[0]]).toEqual([0, 255]);
  expect([...createRasterPreview(raster).rgba]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  expect(raster.metadata.photometric).toBe(0);
  expect(raster.metadata.tags.PhotometricInterpretation).toBe(0);
  expect(raster.sourceBuffer).toBe(buffer);
});

test.each([1, 8])('one-bit rows honor byte padding with compression %s', async (compression) => {
  const raster = await decodeTiff(
    tiffFixture({
      width: 3,
      height: 2,
      bits: 1,
      values: [1, 0, 1, 0, 1, 0],
      compression,
    }),
  );
  expect([...raster.bands[0]]).toEqual([1, 0, 1, 0, 1, 0]);
  expect(raster.metadata.storageRowStrideBytes).toBe(1);
  const preview = createRasterPreview(raster);
  expect([0, 1, 2, 3, 4, 5].map((i) => preview.rgba[i * 4])).toEqual([255, 0, 255, 0, 255, 0]);
});

test('palette indices retain their integer values and use the 16-bit TIFF color map', async () => {
  const raster = await decodeTiff(
    tiffFixture({
      width: 3,
      height: 1,
      bits: 2,
      photometric: 3,
      values: [0, 1, 2],
      colorMap: [65535, 0, 0, 0, 0, 65535, 0, 0, 0, 0, 65535, 0],
    }),
  );
  expect([...raster.bands[0]]).toEqual([0, 1, 2]);
  expect([...createRasterPreview(raster).rgba]).toEqual([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
  ]);
  expect(createRasterPreview(raster, { mode: 'labels' }).labelColors.size).toBe(3);
});

test.each([true, false])(
  'low-valued 16-bit label IDs survive decoding (little endian: %s)',
  async (littleEndian) => {
    const raster = await decodeTiff(
      tiffFixture({
        width: 3,
        height: 1,
        bits: 16,
        values: [0, 1, 2],
        littleEndian,
      }),
    );
    expect(raster.bands[0]).toBeInstanceOf(Uint16Array);
    const preview = createRasterPreview(raster, { mode: 'labels' });
    expect([...raster.bands[0]]).toEqual([0, 1, 2]);
    expect(preview.labelColors.get(0)).toEqual([0, 0, 0, 0]);
    expect(preview.labelColors.get(1)).not.toEqual(preview.labelColors.get(2));
    expect(preview.rgba[7]).toBe(255);
    expect(preview.rgba[11]).toBe(255);
    expect(raster.metadata.byteOrder).toBe(littleEndian ? 'little-endian' : 'big-endian');
  },
);

test('more than 256 labels get distinct categorical colors and keep original uint32 IDs', async () => {
  const values = [0, ...Array.from({ length: 1024 }, (_, i) => 4294967295 - i)];
  const raster = await decodeTiff(
    tiffFixture({ width: values.length, height: 1, bits: 32, values }),
  );
  expect(raster.bands[0]).toBeInstanceOf(Uint32Array);
  const preview = createRasterPreview(raster, { mode: 'labels' });
  expect([...raster.bands[0]]).toEqual(values);
  expect(preview.labelColors.size).toBe(values.length);
  expect(new Set([...preview.labelColors.values()].map((color) => color.join(','))).size).toBe(
    values.length,
  );
});

test.each([
  { bits: 32, littleEndian: true },
  { bits: 64, littleEndian: true },
  { bits: 32, littleEndian: false },
  { bits: 64, littleEndian: false },
])(
  'float$bits samples stay floating point (little endian: $littleEndian)',
  async ({ bits, littleEndian }) => {
    const raster = await decodeTiff(
      tiffFixture({
        width: 5,
        height: 1,
        bits,
        sampleFormat: 3,
        littleEndian,
        values: [-2, 0, 2, NaN, Infinity],
      }),
    );
    expect(raster.bands[0]).toBeInstanceOf(bits === 32 ? Float32Array : Float64Array);
    expect(defaultRasterPreview(raster).mode).toBe('continuous');
    expect([...createRasterPreview(raster).rgba]).toEqual([
      0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect([...raster.bands[0]]).toEqual([-2, 0, 2, NaN, Infinity]);
    expect(() => createRasterPreview(raster, { mode: 'labels' })).toThrow(/not supported/);
  },
);

test('continuous windowing clips only the preview and honors no-data values', async () => {
  const raster = await decodeTiff(
    tiffFixture({
      width: 4,
      height: 1,
      bits: 16,
      sampleFormat: 2,
      values: [-1, 0, 1, 2],
      noData: '-1',
    }),
  );
  expect(raster.bands[0]).toBeInstanceOf(Int16Array);
  expect([
    ...createRasterPreview(raster, { mode: 'continuous', window: { min: 0, max: 1 } }).rgba,
  ]).toEqual([0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  expect([...raster.bands[0]]).toEqual([-1, 0, 1, 2]);
  expect(() =>
    createRasterPreview(raster, { mode: 'continuous', window: { min: 1, max: 1 } }),
  ).toThrow(/display window/);
});

test('RGB photographs keep separate 16-bit bands and use a tonal preview', async () => {
  const raster = await decodeTiff(
    tiffFixture({
      width: 2,
      height: 1,
      bits: 16,
      samplesPerPixel: 3,
      photometric: 2,
      values: [65535, 0, 0, 0, 32768, 65535],
    }),
  );
  expect(raster.bands.map((band) => [...band])).toEqual([
    [65535, 0],
    [0, 32768],
    [0, 65535],
  ]);
  expect(defaultRasterPreview(raster).mode).toBe('photograph');
  expect([...createRasterPreview(raster).rgba]).toEqual([255, 0, 0, 255, 0, 128, 255, 255]);
});

test('associated alpha is unpremultiplied only in the display preview', async () => {
  const raster = await decodeTiff(
    tiffFixture({
      width: 1,
      height: 1,
      samplesPerPixel: 4,
      photometric: 2,
      values: [64, 32, 16, 128],
      extraSamples: [1],
    }),
  );
  expect([...createRasterPreview(raster).rgba]).toEqual([128, 64, 32, 128]);
  expect(raster.bands.map((band) => band[0])).toEqual([64, 32, 16, 128]);
});

test('RGB no-data is transparent only when all color channels are missing', async () => {
  const raster = await decodeTiff(
    tiffFixture({
      width: 2,
      height: 1,
      samplesPerPixel: 3,
      photometric: 2,
      values: [0, 255, 0, 0, 0, 0],
      noData: '0',
    }),
  );
  expect([...createRasterPreview(raster).rgba]).toEqual([0, 255, 0, 255, 0, 0, 0, 0]);
});

test.each([{ values: [0, Number.MIN_VALUE] }, { values: [-Number.MAX_VALUE, Number.MAX_VALUE] }])(
  'continuous float64 previews handle extreme display ranges: %j',
  async ({ values }) => {
    const raster = await decodeTiff(
      tiffFixture({
        width: 2,
        height: 1,
        bits: 64,
        sampleFormat: 3,
        values,
      }),
    );
    expect([...createRasterPreview(raster).rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect([...raster.bands[0]]).toEqual(values);
  },
);

test.each([{ orientation: 3 }, { fillOrder: 2 }, { photometric: 5 }])(
  'unsupported TIFF layouts fail explicitly: %j',
  async (options) => {
    await expect(
      decodeTiff(tiffFixture({ width: 1, height: 1, values: [0], ...options })),
    ).rejects.toThrow(/Unsupported TIFF/);
  },
);

test('same-sized scientific TIFF imports replace the image instead of becoming a mask', async () => {
  const context = createContext();
  context.setImage(image(3, 1), 'old.png');
  const file = tiffFile(
    tiffFixture({ width: 3, height: 1, bits: 32, sampleFormat: 3, values: [0, 0.5, 1] }),
  );
  await processImageFile(file, context);
  expect(context.maskData).toBeNull();
  expect(context.imageFileName).toBe('image.tif');
  expect(context.imageData?.raster?.bands[0]).toBeInstanceOf(Float32Array);
});

test('explicit TIFF mask import, preview changes, and undo preserve the label source', async () => {
  const context = createContext();
  context.setImage(image(3, 1), 'base.png');
  const buffer = tiffFixture({ width: 3, height: 1, bits: 16, values: [0, 1, 2] });
  await processImageFile(tiffFile(buffer), context, 'mask');
  expect(context.imageFileName).toBe('base.png');
  const samples = context.maskData?.raster?.bands[0];
  expect(samples).toBeInstanceOf(Uint16Array);
  expect(context.maskData?.preview?.mode).toBe('labels');
  context.setRasterPreview('mask', { mode: 'continuous', window: { min: 0, max: 2 } });
  expect(context.maskData?.raster?.bands[0]).toBe(samples);
  context.undo();
  expect(context.maskData?.preview?.mode).toBe('labels');
  context.redo();
  expect(context.maskData?.preview?.mode).toBe('continuous');
  context.clearHistory();
  context.clearAll();
  context.undo();
  expect(context.maskData?.raster?.bands[0]).toBe(samples);
  expect([...(samples ?? [])]).toEqual([0, 1, 2]);
});

test('mask validation leaves the current document unchanged', async () => {
  const context = createContext();
  context.setImage(image(3, 1), 'base.png');
  await expect(
    processImageFile(tiffFile(tiffFixture({ width: 1, height: 1, values: [1] })), context, 'mask'),
  ).rejects.toThrow(/dimensions/);
  const floatFile = tiffFile(
    tiffFixture({ width: 3, height: 1, bits: 32, sampleFormat: 3, values: [0, 1, 2] }),
  );
  await expect(processImageFile(floatFile, context, 'mask')).rejects.toThrow(/not supported/);
  expect(context.imageFileName).toBe('base.png');
  expect(context.maskData).toBeNull();
  expect(context.history).toHaveLength(1);
});

test('image loading retains source metadata independently of its display canvas', async () => {
  const { imageData } = await loadImage(
    tiffFile(tiffFixture({ width: 2, height: 1, bits: 16, values: [1, 2] })),
  );
  expect(imageData.raster?.metadata.bitsPerSample).toEqual([16]);
  expect(imageData.raster?.metadata.sampleFormat).toEqual([1]);
  expect(imageData.preview?.mode).toBe('continuous');
  expect([...(imageData.raster?.bands[0] ?? [])]).toEqual([1, 2]);
});

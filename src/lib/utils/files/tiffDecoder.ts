import type { TiffRaster } from '$lib/types';

export async function decodeTiff(buffer: ArrayBuffer): Promise<TiffRaster> {
  const { fromArrayBuffer } = await import('geotiff');
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage(0);
  const directory = image.getFileDirectory();
  const width = image.getWidth();
  const height = image.getHeight();
  const samplesPerPixel = image.getSamplesPerPixel();
  const bitsPerSample = Array.from({ length: samplesPerPixel }, (_, i) =>
    image.getBitsPerSample(i),
  );
  const sampleFormat = Array.from({ length: samplesPerPixel }, (_, i) => image.getSampleFormat(i));
  const photometric = directory.getValue('PhotometricInterpretation') ?? 1;
  const orientation = (await directory.loadValue('Orientation')) ?? 1;
  const fillOrder = (await directory.loadValue('FillOrder')) ?? 1;
  const predictor = (await directory.loadValue('Predictor')) ?? 1;

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('TIFF dimensions must be positive integers');
  }
  if (![0, 1, 2, 3].includes(photometric)) {
    throw new Error(`Unsupported TIFF photometric interpretation: ${photometric}`);
  }
  if (orientation !== 1 || fillOrder !== 1) {
    throw new Error(
      'Unsupported TIFF orientation or fill order; convert to top-left, MSB-first TIFF',
    );
  }
  if (
    bitsPerSample.some((bits) => bits !== bitsPerSample[0]) ||
    sampleFormat.some((format) => format !== sampleFormat[0])
  ) {
    throw new Error('TIFF channels with different sample depths or formats are not supported');
  }
  const bits = bitsPerSample[0];
  const format = sampleFormat[0];
  const supported =
    format === 1 ? [1, 2, 4, 8, 16, 32] : format === 2 ? [8, 16, 32] : format === 3 ? [32, 64] : [];
  if (!supported.includes(bits)) {
    throw new Error(`Unsupported TIFF sample format ${format} with ${bits} bits`);
  }
  if (predictor !== 1 && !image.littleEndian && bits > 8) {
    throw new Error(
      'Big-endian TIFF prediction above 8 bits is not supported; save without prediction',
    );
  }
  if (
    photometric === 2
      ? ![3, 4].includes(samplesPerPixel)
      : photometric === 3
        ? samplesPerPixel !== 1 || format !== 1
        : ![1, 2].includes(samplesPerPixel)
  ) {
    throw new Error('Unsupported TIFF channel layout');
  }
  const colorMapValue = await directory.loadValue('ColorMap');
  const colorMap = colorMapValue ? Array.from(colorMapValue) : undefined;
  if (photometric === 3 && (!colorMap || colorMap.length !== 3 * 2 ** bits)) {
    throw new Error('Palette TIFF requires a complete 16-bit RGB color map');
  }
  const extraSamples = Array.from(directory.getValue('ExtraSamples') ?? []);
  const colorChannels = photometric === 2 ? 3 : 1;
  if (samplesPerPixel > colorChannels && ![1, 2].includes(extraSamples[0])) {
    throw new Error('TIFF extra channels must declare associated or unassociated alpha');
  }
  if (format !== 1 && (samplesPerPixel > 1 || photometric === 3)) {
    throw new Error(
      'Signed and floating-point TIFF previews currently require one grayscale channel',
    );
  }

  // Separate bands avoid promoting or quantizing samples into an interleaved RGB buffer.
  const bands = await image.readRasters({ interleave: false });
  if (bands.some((band) => band.length !== width * height)) {
    throw new Error('TIFF sample count does not match its dimensions');
  }
  return {
    width,
    height,
    bands: Array.from(bands),
    sourceBuffer: buffer,
    metadata: {
      bitsPerSample,
      sampleFormat,
      samplesPerPixel,
      photometric,
      byteOrder: image.littleEndian ? 'little-endian' : 'big-endian',
      planarConfiguration: image.planarConfiguration,
      storageRowStrideBytes: Math.ceil(
        (image.getTileWidth() * bits * (image.planarConfiguration === 2 ? 1 : samplesPerPixel)) / 8,
      ),
      colorMap,
      extraSamples,
      noData: image.getGDALNoData(),
      pageCount: await tiff.getImageCount(),
      pageIndex: 0,
      tags: structuredClone(directory.toObject()),
    },
  };
}

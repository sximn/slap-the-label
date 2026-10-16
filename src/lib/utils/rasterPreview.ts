import type { ImageData, RasterPreviewMode, RasterPreviewSettings, TiffRaster } from '$lib/types';
import { imageDataToCanvas } from './canvasDrawer';

export function getRasterPreviewModes(raster: TiffRaster): RasterPreviewMode[] {
  const { samplesPerPixel, photometric, sampleFormat } = raster.metadata;
  const modes: RasterPreviewMode[] = [];
  if (sampleFormat[0] === 1) modes.push('photograph');
  if (samplesPerPixel === 1 && photometric !== 3) modes.push('continuous');
  if (samplesPerPixel === 1 && sampleFormat[0] !== 3) modes.push('labels');
  return modes;
}

export function defaultRasterPreview(raster: TiffRaster): RasterPreviewSettings {
  const { photometric, bitsPerSample, sampleFormat, samplesPerPixel } = raster.metadata;
  return {
    mode:
      samplesPerPixel > 1 || photometric === 3 || (bitsPerSample[0] <= 8 && sampleFormat[0] === 1)
        ? 'photograph'
        : 'continuous',
  };
}

function isMissing(value: number, raster: TiffRaster) {
  return !Number.isFinite(value) || value === raster.metadata.noData;
}

export function createRasterPreview(raster: TiffRaster, settings = defaultRasterPreview(raster)) {
  if (!getRasterPreviewModes(raster).includes(settings.mode)) {
    throw new Error(`The ${settings.mode} preview is not supported for this TIFF sample layout`);
  }
  const { width, height, bands, metadata } = raster;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const labelColors = new Map<number, readonly [number, number, number, number]>();
  let window = settings.window;

  if (settings.mode === 'labels') {
    const labels = new Set<number>();
    for (const value of bands[0]) {
      if (isMissing(value, raster) || value === 0) continue;
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error('Label masks require non-negative integer class IDs');
      }
      labels.add(value);
    }
    if (labels.size > 0xffffff) throw new Error('Too many labels for distinct RGB preview colors');
    labelColors.set(0, [0, 0, 0, 0]);
    // Odd multiplication permutes the 24-bit colors without merging IDs in this layer.
    [...labels]
      .sort((a, b) => a - b)
      .forEach((label, index) => {
        const color = Math.imul(index + 1, 0x5bd1e995) & 0xffffff;
        labelColors.set(label, [color >>> 16, (color >>> 8) & 255, color & 255, 255]);
      });
  } else if (settings.mode === 'continuous') {
    if (window) {
      if (
        !Number.isFinite(window.min) ||
        !Number.isFinite(window.max) ||
        window.max <= window.min
      ) {
        throw new Error('The display window needs finite limits with maximum greater than minimum');
      }
    } else {
      let min = Infinity,
        max = -Infinity;
      for (const value of bands[0]) {
        if (isMissing(value, raster)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      window = Number.isFinite(min) ? { min, max } : { min: 0, max: 1 };
    }
  }

  const maximum = 2 ** metadata.bitsPerSample[0] - 1;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const value = bands[0][pixel];
    const missing =
      settings.mode === 'photograph' && metadata.photometric === 2
        ? isMissing(value, raster) &&
          isMissing(bands[1][pixel], raster) &&
          isMissing(bands[2][pixel], raster)
        : isMissing(value, raster);
    if (missing) continue;
    const offset = pixel * 4;
    if (settings.mode === 'labels') {
      rgba.set(labelColors.get(value)!, offset);
    } else if (settings.mode === 'continuous') {
      const { min, max } = window!;
      const span = max - min;
      const scaled =
        max === min
          ? 0.5
          : Number.isFinite(span)
            ? (value - min) / span
            : (value / 2 - min / 2) / (max / 2 - min / 2);
      const gray = Math.round(255 * Math.max(0, Math.min(1, scaled)));
      rgba[offset] =
        rgba[offset + 1] =
        rgba[offset + 2] =
          metadata.photometric === 0 ? 255 - gray : gray;
      rgba[offset + 3] = 255;
    } else {
      const alphaBand =
        metadata.samplesPerPixel > (metadata.photometric === 2 ? 3 : 1) ? bands.at(-1) : undefined;
      const alpha = alphaBand ? alphaBand[pixel] / maximum : 1;
      if (metadata.photometric === 3) {
        const entries = 2 ** metadata.bitsPerSample[0];
        for (let channel = 0; channel < 3; channel++) {
          rgba[offset + channel] = Math.round(metadata.colorMap![channel * entries + value] / 257);
        }
      } else {
        for (let channel = 0; channel < 3; channel++) {
          const sample = metadata.photometric === 2 ? bands[channel][pixel] : value;
          let intensity = sample / maximum;
          if (metadata.photometric === 0) intensity = 1 - intensity;
          if (alphaBand && metadata.extraSamples[0] === 1)
            intensity = alpha > 0 ? intensity / alpha : 0;
          rgba[offset + channel] = Math.round(intensity * 255);
        }
      }
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }
  return { rgba, labelColors, settings: { ...settings } };
}

export function withRasterPreview(data: ImageData, settings: RasterPreviewSettings): ImageData {
  if (!data.raster) throw new Error('This image has no TIFF source samples');
  const preview = createRasterPreview(data.raster, settings);
  return {
    ...data,
    canvasElement: imageDataToCanvas(preview.rgba, data.width, data.height),
    preview: preview.settings,
    labelColors: preview.labelColors,
  };
}

import type { ImageData, RasterPreviewSettings } from '$lib/types';
import { imageDataToCanvas } from '../canvasDrawer';
import { createRasterPreview, defaultRasterPreview } from '../rasterPreview';
import { decodeTiff } from './tiffDecoder';

export async function loadImage(file: File, settings?: RasterPreviewSettings) {
  const isTiff = /\.tiff?$/i.test(file.name) || ['image/tiff', 'image/x-tiff'].includes(file.type);
  const imageData = isTiff ? await loadTiffImage(file, settings) : await loadStandardImage(file);
  return { imageData };
}

async function loadStandardImage(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas context is not available');
        ctx.drawImage(img, 0, 0);
        resolve({ width: img.width, height: img.height, canvasElement: canvas });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

async function loadTiffImage(file: File, settings?: RasterPreviewSettings): Promise<ImageData> {
  try {
    const raster = await decodeTiff(await file.arrayBuffer());
    const preview = createRasterPreview(raster, settings ?? defaultRasterPreview(raster));
    return {
      width: raster.width,
      height: raster.height,
      canvasElement: imageDataToCanvas(preview.rgba, raster.width, raster.height),
      raster,
      preview: preview.settings,
      labelColors: preview.labelColors,
    };
  } catch (error) {
    throw new Error(`Failed to load TIFF image: ${(error as Error).message}`);
  }
}

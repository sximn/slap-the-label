import type { CanvasContext } from '$lib/context/canvasContext.svelte';
import type { ImageData, RasterPreviewSettings, RasterTarget } from '$lib/types';
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

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      resolve({
        width: img.width,
        height: img.height,
        canvasElement: canvas,
      });
    };

    img.onerror = (e) => {
      console.error(e);
      return reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
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

export async function processImageFile(
  file: File,
  ctx: CanvasContext,
  target: RasterTarget = 'image',
) {
  try {
    if (target === 'mask' && !ctx.imageData) {
      throw new Error('Add an image before loading a mask');
    }
    const { imageData } = await loadImage(file, target === 'mask' ? { mode: 'labels' } : undefined);
    if (target === 'mask') {
      if (ctx.imageData?.width !== imageData.width || ctx.imageData?.height !== imageData.height) {
        throw new Error('Mask dimensions must match the current image');
      }
      ctx.setMask(imageData);
    } else {
      ctx.setImage(imageData, file.name);
    }
  } catch (error) {
    throw new Error(
      'Failed to load image: ' + (error instanceof Error ? error.message : String(error)),
    );
  }
}

import type { CanvasContext } from '$lib/context/canvasContext.svelte';
import type {
  AnnotationFile,
  ImageCoordinateSpace,
  ImageData,
  ImportedSource,
  ImportRole,
} from '$lib/types';
import { getRasterPreviewModes, withRasterPreview } from '../rasterPreview';
import { readGeoJsonFile } from './geojsonLoader';
import { loadImage } from './imageLoader';
import { readTextFile } from './textLoader';

export const IMPORT_ACCEPT =
  'image/*,.tif,.tiff,.txt,.json,.geojson,application/geo+json,application/json,text/plain';

function fileFormat(file: File) {
  // Decode the source once so History can change its interpretation without rereading the file.
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'geojson' || extension === 'json') return 'geojson';
  if (extension === 'txt') return 'yolo';
  if (/^(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?)$/.test(extension ?? '')) return 'image';
  if (file.type === 'application/geo+json' || file.type === 'application/json') return 'geojson';
  if (file.type === 'text/plain') return 'yolo';
  if (file.type.startsWith('image/')) return 'image';
  return undefined;
}

export function isImportRole(value: string): value is ImportRole {
  return value === 'image' || value === 'mask' || value === 'annotation';
}

export function inferImportRole(
  source: ImportedSource,
  currentImage: ImageData | null,
): ImportRole {
  if (source.kind === 'annotation') return 'annotation';
  if (!currentImage) return 'image';
  if (/(?:^|[\W_])(?:masks?|labels?|segmentation|instances?)(?:[\W_]|$)/i.test(source.name))
    return 'mask';
  if (source.data.width !== currentImage.width || source.data.height !== currentImage.height)
    return 'image';
  if (source.data.raster) {
    const { samplesPerPixel, sampleFormat } = source.data.raster.metadata;
    return samplesPerPixel === 1 && sampleFormat[0] === 1 ? 'mask' : 'image';
  }
  const context = source.data.canvasElement.getContext?.('2d');
  if (context) {
    const pixels = context.getImageData(0, 0, source.data.width, source.data.height).data;
    // Appearance is only a default. History retains the source for role corrections.
    const step = Math.max(1, Math.floor(pixels.length / (4 * 50000)));
    for (let i = 0; i < pixels.length; i += 4 * step) {
      if (Math.abs(pixels[i] - pixels[i + 1]) > 2 || Math.abs(pixels[i + 1] - pixels[i + 2]) > 2)
        return 'image';
    }
    return 'mask';
  }
  return 'image';
}

type ImportTransition =
  | { type: 'image'; payload: { data: ImageData; name: string } }
  | { type: 'mask'; payload: { data: ImageData } }
  | { type: 'annotation'; payload: { action: 'add'; file: AnnotationFile } };

export function getImportTransition(
  source: ImportedSource,
  role: ImportRole,
  image: ImageData | null,
): ImportTransition {
  if (role === 'annotation') {
    if (source.kind !== 'annotation')
      throw new Error('This file contains raster pixels, not YOLO or GeoJSON annotations.');
    if (!image) throw new Error('Add an image before importing annotations.');
    return { type: 'annotation', payload: { action: 'add', file: source.annotationFile } };
  }
  if (source.kind !== 'raster') {
    throw new Error(
      `This file contains ${source.format === 'yolo' ? 'YOLO text' : 'GeoJSON geometry'}, not raster pixels. It cannot be used as an ${role === 'image' ? 'image' : 'image mask'}.`,
    );
  }
  if (role === 'image') return { type: 'image', payload: { data: source.data, name: source.name } };
  if (!image) throw new Error('Add an image before importing a mask.');
  if (source.data.width !== image.width || source.data.height !== image.height) {
    throw new Error(
      `Mask dimensions ${source.data.width}×${source.data.height} must match the current image ${image.width}×${image.height}.`,
    );
  }
  return { type: 'mask', payload: { data: source.maskData } };
}

async function readSource(
  file: File,
  coordinateSpace: ImageCoordinateSpace,
): Promise<ImportedSource> {
  const format = fileFormat(file);
  if (format === 'geojson' || format === 'yolo') {
    const annotationFile =
      format === 'geojson'
        ? await readGeoJsonFile(file, coordinateSpace)
        : await readTextFile(file);
    return { kind: 'annotation', format, name: file.name, annotationFile };
  }
  if (format !== 'image')
    throw new Error(
      'Unsupported file. Choose an image, YOLO .txt, or GeoJSON .json/.geojson file.',
    );
  const { imageData: data } = await loadImage(file);
  let maskData = data;
  if (data.raster && getRasterPreviewModes(data.raster).includes('labels')) {
    // Signed scientific samples may include negative values; retain their continuous preview.
    const nonNegative = data.raster.bands[0].every(
      (value) => value >= 0 || value === data.raster!.metadata.noData,
    );
    if (nonNegative) maskData = withRasterPreview(data, { mode: 'labels' });
  }
  return { kind: 'raster', name: file.name, data, maskData };
}

export async function importFile(
  file: File,
  ctx: CanvasContext,
  role?: ImportRole,
  coordinateSpace: ImageCoordinateSpace = 'pixel',
) {
  if (role !== undefined && !isImportRole(role))
    throw new Error('Choose an image, mask, or annotation import role');
  const currentImage = ctx.imageData;
  const source = await readSource(file, coordinateSpace);
  if (ctx.imageData !== currentImage)
    throw new Error(
      'The image changed during import. Import the file again for the current image.',
    );
  const chosenRole = role ?? inferImportRole(source, currentImage);
  const error = ctx.addImport(source, chosenRole);
  if (error) throw new Error(error);
}

export async function importFiles(files: File[], ctx: CanvasContext, role?: ImportRole) {
  const errors: string[] = [];
  let imported = 0;
  let expectedImage = ctx.imageData;
  if (role && role !== 'annotation' && files.length > 1) {
    return { imported, errors: [`Import one ${role} at a time. No files were imported.`] };
  }
  for (const file of files) {
    if (ctx.imageData !== expectedImage) {
      errors.push('The image changed during import. Remaining files were not imported.');
      break;
    }
    try {
      await importFile(file, ctx, role);
      imported++;
      expectedImage = ctx.imageData;
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { imported, errors };
}

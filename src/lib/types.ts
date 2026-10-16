export interface BBoxAnnotation {
  type: 'bbox';
  class: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sourceFile?: string; // track which file this came from
}

export interface PolygonAnnotation {
  type: 'polygon';
  class?: string;
  points: number[]; // flat array [x1, y1, x2, y2, ...]
  properties?: Record<string, any>; // store any GeoJSON properties
  sourceFile?: string;
}

export type Annotation = BBoxAnnotation | PolygonAnnotation;

export type ImageCoordinateSpace = 'pixel' | 'normalized';

export interface AnnotationFile {
  name: string;
  annotations: Annotation[];
  visible: boolean;
  color: string; // distinct color per file
  // omitted for existing YOLO layers, which use normalized image coordinates
  coordinateSpace?: ImageCoordinateSpace;
}

export interface ImageData {
  width: number;
  height: number;
  canvasElement: HTMLCanvasElement;
  raster?: TiffRaster;
  preview?: RasterPreviewSettings;
  labelColors?: Map<number, readonly [number, number, number, number]>;
}

export type RasterSamples =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array
  | Float32Array
  | Float64Array;

export interface TiffRaster {
  width: number;
  height: number;
  // Separate native typed bands, in row-major order. Previews never modify these.
  bands: RasterSamples[];
  // Retain the original file, including metadata not interpreted by the viewer.
  sourceBuffer: ArrayBuffer;
  metadata: {
    bitsPerSample: number[];
    sampleFormat: number[];
    samplesPerPixel: number;
    photometric: number;
    byteOrder: 'little-endian' | 'big-endian';
    planarConfiguration: number;
    storageRowStrideBytes: number;
    colorMap?: number[];
    extraSamples: number[];
    noData: number | null;
    pageCount: number;
    pageIndex: number;
    tags: Record<string, unknown>;
  };
}

export type RasterPreviewMode = 'photograph' | 'continuous' | 'labels';
export type RasterTarget = 'image' | 'mask';
export type ImportRole = RasterTarget | 'annotation';

export type ImportedSource =
  | { kind: 'raster'; name: string; data: ImageData; maskData: ImageData }
  | {
      kind: 'annotation';
      name: string;
      format: 'yolo' | 'geojson';
      annotationFile: AnnotationFile;
    };

export interface RasterPreviewSettings {
  mode: RasterPreviewMode;
  // omit to use the finite data range for a continuous preview
  window?: { min: number; max: number };
}

export interface DrawSettings {
  lineWidth: number;
  showLabels: boolean;
}

export const MaskVisualizationValues = ['normal', 'solid', 'heatmap'] as const;
export type MaskVisualization = (typeof MaskVisualizationValues)[number];
export function isMaskVisualizationType(value: string): value is MaskVisualization {
  return (MaskVisualizationValues as readonly string[]).includes(value);
}

export interface DisplaySettings {
  colorMode: 'file' | 'class';
  maskVisualization: MaskVisualization;
  maskOpacity: number;
}

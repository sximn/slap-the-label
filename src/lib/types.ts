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

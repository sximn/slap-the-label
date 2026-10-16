import type { AnnotationFile, ImageCoordinateSpace, PolygonAnnotation } from '$lib/types';

interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties?: unknown;
}

interface GeoJSON {
  type: 'FeatureCollection' | 'Feature';
  features?: GeoJSONFeature[];
  geometry?: GeoJSONFeature['geometry'];
  properties?: unknown;
}

export async function readGeoJsonFile(
  file: File,
  coordinateSpace: ImageCoordinateSpace = 'pixel',
): Promise<AnnotationFile> {
  const color = `hsl(${Math.random() * 360}, 70%, 50%)`;

  const geojsonText = await file.text();
  const annotations = parseGeoJSON(geojsonText, file.name);
  return {
    name: file.name,
    annotations,
    visible: true,
    color,
    coordinateSpace,
  };
}

export function parseGeoJSON(geojsonText: string, sourceFile: string): PolygonAnnotation[] {
  const geojson: GeoJSON = JSON.parse(geojsonText);
  const annotations: PolygonAnnotation[] = [];

  const features: GeoJSONFeature[] =
    geojson.type === 'FeatureCollection'
      ? geojson.features || []
      : geojson.type === 'Feature'
        ? [geojson as GeoJSONFeature]
        : [];

  for (const feature of features) {
    if (!feature.geometry) continue;

    const { type, coordinates } = feature.geometry;
    const properties = isRecord(feature.properties) ? feature.properties : undefined;
    const classification = properties?.classification;
    // keep top-level class/name/label precedence; nested classification is a fallback
    const className =
      normalizeClassIdentifier(properties?.class) ??
      normalizeClassIdentifier(properties?.name) ??
      normalizeClassIdentifier(properties?.label) ??
      normalizeClassIdentifier(isRecord(classification) ? classification.name : undefined);

    if (type === 'Polygon') {
      // coordinates is number[][][]
      const polygonCoords = coordinates as number[][][];
      const ring = polygonCoords[0]; // exterior ring: [[x1,y1], [x2,y2], ...]
      if (!ring?.length) continue;
      const points = readCoordinates(ring);

      annotations.push({
        type: 'polygon',
        class: className,
        points,
        properties,
        sourceFile,
      });
    } else if (type === 'MultiPolygon') {
      // MultiPolygon: [[[[x1,y1], [x2,y2], ...]], ...]
      // coordinates is number[][][][]
      const multiPolygonCoords = coordinates as number[][][][];
      for (const polygon of multiPolygonCoords) {
        const ring = polygon[0]; // exterior ring: [[x1,y1], [x2,y2], ...]
        if (!ring?.length) continue;
        const points = readCoordinates(ring);

        annotations.push({
          type: 'polygon',
          class: className,
          points,
          properties,
          sourceFile,
        });
      }
    }
  }

  return annotations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeClassIdentifier(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function readCoordinates(ring: number[][]): number[] {
  const points: number[] = [];

  for (const coord of ring) {
    if (
      !Array.isArray(coord) ||
      coord.length < 2 ||
      !Number.isFinite(coord[0]) ||
      !Number.isFinite(coord[1])
    ) {
      throw new Error('GeoJSON positions must contain finite numeric x and y coordinates');
    }

    // Keep source coordinates intact. The layer's explicit coordinate space
    // determines the shared rendering transform; polygon bounds never affect it.
    points.push(coord[0], coord[1]);
  }

  return points;
}

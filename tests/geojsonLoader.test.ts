import { expect, test } from 'vitest';
import type { CanvasContext } from '$lib/context/canvasContext.svelte';
import type { ImageCoordinateSpace } from '$lib/types';
import { parseGeoJSON } from '$lib/utils/files/geojsonLoader';
import { importFile } from '$lib/utils/files/loader';
import { getImageCoordinateScale } from '$lib/utils/coordinates';
import { createContext, image } from './helpers/canvasContext';

const feature = (coordinates: unknown, type = 'Polygon') => ({
  type: 'Feature',
  geometry: { type, coordinates },
  properties: { class: 'object' },
});

async function loadLayer(geojson: unknown, coordinateSpace: ImageCoordinateSpace = 'pixel') {
  const context = createContext();
  context.setImage(image(1000, 500), 'image.png');

  const file = new File([JSON.stringify(geojson)], 'polygons.geojson', {
    type: 'application/geo+json',
  });

  await importFile(file, context, 'annotation', coordinateSpace);
  return context;
}

// Use the same layer transform as ImageLayer to check actual image pixel positions.
function renderedPoints(context: CanvasContext) {
  const layer = context.annotationFiles[0];

  const { scaleX, scaleY } = getImageCoordinateScale(
    layer.coordinateSpace ?? 'normalized',
    context.imageData!.width,
    context.imageData!.height,
  );

  return layer.annotations.map((annotation) => {
    if (annotation.type !== 'polygon') {
      throw new Error('Expected a polygon');
    }

    return annotation.points.map((point, index) => point * (index % 2 === 0 ? scaleX : scaleY));
  });
}

test('a five-pixel polygon keeps its size and position instead of filling the image', async () => {
  const ring = [
    [100, 200],
    [105, 200],
    [105, 205],
    [100, 200],
  ];
  const context = await loadLayer(feature([ring]));

  expect(context.annotationFiles[0].coordinateSpace).toBe('pixel');
  expect(renderedPoints(context)).toEqual([ring.flat()]);
});

test('small and large polygons use one pixel transform across a layer', async () => {
  const small = [
    [0, 0],
    [0.5, 0],
    [0.5, 0.5],
    [0, 0],
  ];

  const large = [
    [100, 200],
    [600, 200],
    [600, 400],
    [100, 200],
  ];

  const context = await loadLayer({
    type: 'FeatureCollection',
    features: [feature([small]), feature([[large]], 'MultiPolygon')],
  });

  // even values inside 0–1 are pixels when the layer explicitly uses pixels
  expect(renderedPoints(context)).toEqual([small.flat(), large.flat()]);
});

test.each([
  {
    name: 'vertical',
    ring: [
      [100, 200],
      [100, 205],
      [100, 210],
      [100, 200],
    ],
  },
  {
    name: 'horizontal',
    ring: [
      [100, 200],
      [105, 200],
      [110, 200],
      [100, 200],
    ],
  },
  {
    name: 'point',
    ring: [
      [100, 200],
      [100, 200],
      [100, 200],
      [100, 200],
    ],
  },
])('$name polygons keep finite, unchanged coordinates', async ({ ring }) => {
  const context = await loadLayer(feature([ring]));
  expect(renderedPoints(context)).toEqual([ring.flat()]);
  expect(renderedPoints(context).flat().every(Number.isFinite)).toBe(true);
});

test('normalized layers scale by image dimensions without fitting or clipping', async () => {
  const ring = [
    [-0.1, 0.4],
    [0.105, 0.4],
    [0.105, 1.2],
    [-0.1, 0.4],
  ];

  const context = await loadLayer(feature([ring]), 'normalized');

  expect(context.annotationFiles[0].annotations[0]).toMatchObject({ points: ring.flat() });
  expect(renderedPoints(context)).toEqual([[-100, 200, 105, 200, 105, 600, -100, 200]]);
});

test('a coordinate-space change is undoable and survives clearing history', async () => {
  const ring = [
    [0, 0],
    [0.5, 0],
    [0.5, 0.5],
    [0, 0],
  ];

  const context = await loadLayer(feature([ring]));

  context.setAnnotationCoordinateSpace('polygons.geojson', 'normalized');
  expect(renderedPoints(context)).toEqual([[0, 0, 500, 0, 500, 250, 0, 0]]);
  context.undo();
  expect(renderedPoints(context)).toEqual([ring.flat()]);
  context.redo();
  expect(renderedPoints(context)).toEqual([[0, 0, 500, 0, 500, 250, 0, 0]]);
  context.clearHistory();
  context.setAnnotationCoordinateSpace('polygons.geojson', 'pixel');
  context.undo();
  expect(renderedPoints(context)).toEqual([[0, 0, 500, 0, 500, 250, 0, 0]]);
});

test('empty rings are skipped and malformed positions reject the layer before adding it', async () => {
  expect(parseGeoJSON(JSON.stringify(feature([[]])), 'empty.geojson')).toEqual([]);
  for (const position of [[100], [100, null], ['100', 200]]) {
    const context = createContext();
    context.setImage(image(1000, 500), 'image.png');

    const file = new File([JSON.stringify(feature([[[0, 0], position]]))], 'invalid.geojson');

    await expect(importFile(file, context, 'annotation')).rejects.toThrow('finite numeric x and y');
    expect(context.annotationFiles).toEqual([]);
    expect(context.history).toHaveLength(1);
  }
});

import { expect, test } from 'vitest';
import { getPolygonDisplayColor } from '$lib/utils/annotationColor';
import { parseGeoJSON } from '$lib/utils/files/geojsonLoader';

test.each([
  { properties: undefined },
  { properties: null },
  { properties: 'metadata' },
  { properties: [] },
  { properties: {} },
  { properties: { classification: null } },
  { properties: { classification: 0 } },
  { properties: { classification: false } },
  { properties: { classification: 'object' } },
  { properties: { classification: [] } },
  { properties: { classification: {} } },
  { properties: { classification: { color: null } } },
  { properties: { classification: { color: '#ff0000' } } },
  { properties: { classification: { color: [255, 0] } } },
  { properties: { classification: { color: [255, 0, 0, 128] } } },
  { properties: { classification: { color: ['255', 0, 0] } } },
  { properties: { classification: { color: [NaN, 0, 0] } } },
  { properties: { classification: { color: [Infinity, 0, 0] } } },
  { properties: { classification: { color: [-1, 0, 0] } } },
  { properties: { classification: { color: [256, 0, 0] } } },
])('invalid or missing classification metadata uses the supplied color: %j', ({ properties }) => {
  expect(getPolygonDisplayColor(properties, '#123456')).toBe('#123456');
});

test.each([
  { color: [0, 0, 0], expected: 'rgb(0, 0, 0)' },
  { color: [255, 128, 0], expected: 'rgb(255, 128, 0)' },
])('valid classification RGB colors remain supported: %j', ({ color, expected }) => {
  expect(getPolygonDisplayColor({ classification: { color } }, '#123456')).toBe(expected);
});

test('imported GeoJSON with a null classification uses the layer color without changing geometry', () => {
  const points = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 0],
  ];
  const [polygon] = parseGeoJSON(
    JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [points] },
      properties: { classification: null },
    }),
    'null-classification.geojson',
  );

  expect(getPolygonDisplayColor(polygon.properties, '#abcdef')).toBe('#abcdef');
  expect(polygon.points).toEqual(points.flat());
  expect(polygon.properties?.classification).toBeNull();
});

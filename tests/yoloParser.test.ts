import { expect, test } from 'vitest';
import { parseYoloFile } from '$lib/utils/yoloParser';
import { isYoloAnnotation, processTextFile } from '$lib/utils/files/textLoader';
import { createContext, image } from './helpers/canvasContext';

const detection = '0 0.5 0.4 0.2 0.1';
const segmentation = '0 0.1 0.2 0.3 0.4 0.5 0.6';
const file = (text: string) => new File([text], 'labels.txt', { type: 'text/plain' });

test('detection rows contain exactly a class and four normalized coordinates', () => {
  expect(parseYoloFile(detection)).toEqual([
    { type: 'bbox', class: '0', x: 0.5, y: 0.4, w: 0.2, h: 0.1 },
  ]);
});

test('recognition and parsing accept the same whitespace, comments, and numeric notation', async () => {
  const content = `\uFEFF# detections\r\n\r\n  2\t.5 4e-1 0.2 0.1  \r\n${detection}\r\n`;
  expect(await isYoloAnnotation(file(content))).toBe(true);
  expect(parseYoloFile(content)).toEqual([
    { type: 'bbox', class: '2', x: 0.5, y: 0.4, w: 0.2, h: 0.1 },
    { type: 'bbox', class: '0', x: 0.5, y: 0.4, w: 0.2, h: 0.1 },
  ]);
});

test.each([segmentation, `${segmentation} 0.7 0.8`, `${detection} 0.9`])(
  'extended YOLO rows are rejected instead of truncated: %s',
  async (row) => {
    expect(() => parseYoloFile(row)).toThrow(/exactly 5 tokens.*segmentation.*not supported/i);
    expect(await isYoloAnnotation(file(row))).toBe(false);
  },
);

test.each([
  '0 0.5 0.4 0.2',
  'class 0.5 0.4 0.2 0.1',
  '-1 0.5 0.4 0.2 0.1',
  '1.5 0.5 0.4 0.2 0.1',
  '0 NaN 0.4 0.2 0.1',
  '0 Infinity 0.4 0.2 0.1',
  '0 1.1 0.4 0.2 0.1',
])('invalid detection rows fail both recognition and parsing: %s', async (row) => {
  expect(() => parseYoloFile(row)).toThrow(/line 1/i);
  expect(await isYoloAnnotation(file(row))).toBe(false);
});

test('mixed files are rejected in full and identify the unsupported row', () => {
  expect(() => parseYoloFile(`# labels\n${detection}\n${segmentation}`)).toThrow(/line 3/i);
});

test('imports reject segmentation beyond the old sniffing limit without changing the document', async () => {
  const content = [...Array<string>(200).fill(detection), segmentation].join('\n');
  expect(content.length).toBeGreaterThan(2048);
  expect(await isYoloAnnotation(file(content))).toBe(false);

  const context = createContext();
  context.setImage(image(100), 'image.png');
  await expect(processTextFile(file(content), context)).rejects.toThrow(
    /segmentation.*not supported/i,
  );
  expect(context.imageFileName).toBe('image.png');
  expect(context.annotationFiles).toEqual([]);
  expect(context.history).toHaveLength(1);
});

test('valid detection imports add bounding boxes and one history entry', async () => {
  const context = createContext();
  context.setImage(image(100), 'image.png');
  await processTextFile(file(detection), context);

  expect(context.annotationFiles).toHaveLength(1);
  expect(context.annotationFiles[0]).toMatchObject({
    name: 'labels.txt',
    visible: true,
    annotations: [{ type: 'bbox', class: '0', x: 0.5, y: 0.4, w: 0.2, h: 0.1 }],
  });
  expect(context.history).toHaveLength(2);
});

test('empty or comment-only input is not imported as a successful detection layer', async () => {
  const context = createContext();
  context.setImage(image(100), 'image.png');
  expect(await isYoloAnnotation(file('# no detections\n\n'))).toBe(false);
  await expect(processTextFile(file('# no detections\n\n'), context)).rejects.toThrow(
    /no YOLO detection/i,
  );
  expect(context.annotationFiles).toEqual([]);
  expect(context.history).toHaveLength(1);
});

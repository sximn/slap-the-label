import type { Annotation, BBoxAnnotation } from '$lib/types';

export function parseYoloFile(content: string): BBoxAnnotation[] {
  const lines = content.split('\n');
  const annotations: BBoxAnnotation[] = [];

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    // skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(
        `Invalid YOLO detection on line ${index + 1}: expected exactly 5 tokens ` +
          '(class x y width height). Segmentation and other extended row formats are not supported.',
      );
    }

    const [classId, x, y, w, h] = parts.map(Number);

    if (!/^\d+$/.test(parts[0]) || !Number.isSafeInteger(classId)) {
      throw new Error(`Invalid YOLO class on line ${index + 1}: expected a non-negative integer`);
    }

    if ([x, y, w, h].some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
      throw new Error(
        `Invalid YOLO coordinates on line ${index + 1}: expected finite numbers between 0 and 1`,
      );
    }

    annotations.push({
      type: 'bbox',
      class: classId.toString(),
      x,
      y,
      w,
      h,
    });
  }

  return annotations;
}

export function generateClassColors(annotations: Annotation[]): Map<string, string> {
  const uniqueClasses = new Set(annotations.map((a) => a.class));
  const colors = new Map<string, string>();

  const hueStep = 360 / Math.max(uniqueClasses.size, 1);

  Array.from(uniqueClasses).forEach((className, index) => {
    if (className) {
      const hue = (index * hueStep) % 360;
      colors.set(className, `hsl(${hue}, 70%, 60%)`);
    }
  });

  return colors;
}

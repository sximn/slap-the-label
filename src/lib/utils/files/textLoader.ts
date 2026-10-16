import type { AnnotationFile } from '$lib/types';
import { generateClassColors, parseYoloFile } from '../yoloParser';

export async function isYoloAnnotation(file: File) {
  const text = await file.text();
  try {
    return parseYoloFile(text).length > 0;
  } catch {
    return false;
  }
}

export async function readTextFile(file: File): Promise<AnnotationFile> {
  // Parse the entire file once before changing the document. Unsupported rows
  // must not be silently truncated or leave a partially imported layer.
  const annotations = parseYoloFile(await file.text());
  if (annotations.length === 0) {
    throw new Error('Text file contains no YOLO detection annotations');
  }
  const colors = generateClassColors(annotations);
  return {
    annotations,
    color: Array.from(colors.values())[0],
    name: file.name,
    visible: true,
  };
}

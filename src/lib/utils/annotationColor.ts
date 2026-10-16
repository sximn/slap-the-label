export function getPolygonDisplayColor(properties: unknown, fallback: string): string {
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    return fallback;
  }

  const classification = 'classification' in properties ? properties.classification : undefined;
  if (
    classification === null ||
    typeof classification !== 'object' ||
    Array.isArray(classification)
  ) {
    return fallback;
  }

  const color = 'color' in classification ? classification.color : undefined;
  if (
    !Array.isArray(color) ||
    color.length !== 3 ||
    !color.every(
      (channel) =>
        typeof channel === 'number' && Number.isFinite(channel) && channel >= 0 && channel <= 255,
    )
  ) {
    return fallback;
  }

  return `rgb(${color.join(', ')})`;
}

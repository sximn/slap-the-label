import type { ImageCoordinateSpace } from '$lib/types';

export function isImageCoordinateSpace(value: string): value is ImageCoordinateSpace {
  return value === 'pixel' || value === 'normalized';
}

export function getImageCoordinateScale(
  coordinateSpace: ImageCoordinateSpace,
  imageWidth: number,
  imageHeight: number,
) {
  return coordinateSpace === 'pixel'
    ? { scaleX: 1, scaleY: 1 }
    : { scaleX: imageWidth, scaleY: imageHeight };
}

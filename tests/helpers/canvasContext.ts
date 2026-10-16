import { render } from 'svelte/server';
import type { CanvasContext } from '$lib/context/canvasContext.svelte';
import type { ImageData } from '$lib/types';
import CanvasContextFixture from '../fixtures/CanvasContext.svelte';

export function createContext(): CanvasContext {
  let context: CanvasContext | undefined;
  // accessing body forces Svelte lazy server render to initialize the component
  render(CanvasContextFixture, { props: { capture: (value) => (context = value) } }).body;

  if (!context) throw new Error('Canvas context was not initialized');
  return context;
}

export const image = (width: number, height = width): ImageData => ({
  width,
  height,
  // these state tests never draw the canvas
  canvasElement: {} as HTMLCanvasElement,
});

<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import type { ImageData, RasterPreviewMode, RasterTarget } from '$lib/types';
  import { defaultRasterPreview, getRasterPreviewModes } from '$lib/utils/rasterPreview';

  let { data, target }: { data: ImageData; target: RasterTarget } = $props();
  const ctx = getCanvasContext();
  const raster = $derived(data.raster);
  const mode = $derived(
    data.preview?.mode ?? (raster ? defaultRasterPreview(raster).mode : 'photograph'),
  );
  let minimum = $state<number | undefined>();
  let maximum = $state<number | undefined>();
  let errorMessage = $state('');
  const names: Record<RasterPreviewMode, string> = {
    photograph: 'Photographic colors',
    continuous: 'Continuous values',
    labels: 'Integer labels',
  };

  $effect(() => {
    minimum = data.preview?.window?.min;
    maximum = data.preview?.window?.max;
  });

  function updatePreview(newMode: RasterPreviewMode, window?: { min: number; max: number }) {
    try {
      ctx.setRasterPreview(target, { mode: newMode, window });
      errorMessage = '';
      return true;
    } catch (error) {
      errorMessage = (error as Error).message;
      return false;
    }
  }
</script>

{#if raster}
  <div class="space-y-2">
    <label class="flex flex-col gap-1 text-sm">
      <span>{target === 'image' ? 'Image preview' : 'Mask preview'}</span>
      <select
        class="w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm"
        value={mode}
        onchange={(event) => {
          const value = event.currentTarget.value;
          if (getRasterPreviewModes(raster).includes(value as RasterPreviewMode)) {
            if (!updatePreview(value as RasterPreviewMode)) event.currentTarget.value = mode;
          }
        }}
      >
        {#each getRasterPreviewModes(raster) as option}
          <option value={option}>{names[option]}</option>
        {/each}
      </select>
    </label>
    <p class="text-xs text-muted-foreground">
      {raster.metadata.bitsPerSample.join('/')} bit · {raster.metadata.samplesPerPixel} channel(s) ·
      page {raster.metadata.pageIndex + 1} of {raster.metadata.pageCount}
    </p>
    {#if mode === 'continuous'}
      <form
        class="space-y-2"
        onsubmit={(event) => {
          event.preventDefault();
          updatePreview('continuous', { min: Number(minimum), max: Number(maximum) });
        }}
      >
        <div class="flex gap-2">
          <label class="min-w-0 flex-1 text-xs">
            Minimum
            <input
              class="mt-1 w-full rounded border border-border bg-background px-2 py-1"
              aria-label={`${target} display minimum`}
              type="number"
              step="any"
              required
              bind:value={minimum}
            />
          </label>
          <label class="min-w-0 flex-1 text-xs">
            Maximum
            <input
              class="mt-1 w-full rounded border border-border bg-background px-2 py-1"
              aria-label={`${target} display maximum`}
              type="number"
              step="any"
              required
              bind:value={maximum}
            />
          </label>
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          <button class="rounded border border-border px-2 py-1" type="submit">Apply window</button>
          <button
            class="rounded border border-border px-2 py-1"
            type="button"
            onclick={() => updatePreview('continuous')}
          >
            Auto range
          </button>
        </div>
      </form>
    {:else if mode === 'labels'}
      <p class="text-xs text-muted-foreground">
        {Math.max(0, (data.labelColors?.size ?? 1) - 1)} labels · zero is transparent. Source IDs are
        preserved.
      </p>
    {/if}
    {#if errorMessage}<p class="text-xs text-destructive" role="alert">{errorMessage}</p>{/if}
  </div>
{/if}

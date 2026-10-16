<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { Layer, Image, Group } from 'svelte-konva';
  import AnnotationRect from './AnnotationRect.svelte';
  import AnnotationPolygon from './AnnotationPolygon.svelte';
  import { getImageCoordinateScale } from '$lib/utils/coordinates';

  let {
    image,
    mask,
    showMask = $bindable(true),
    maskOpacity = $bindable(0.5),
  }: {
    image: HTMLCanvasElement | HTMLImageElement | undefined;
    mask: HTMLCanvasElement | HTMLImageElement | undefined;
    showMask?: boolean;
    maskOpacity?: number;
  } = $props();

  const ctx = getCanvasContext();

  let x = $state(0);
  let y = $state(0);
  let imageRef: ReturnType<typeof Image> | undefined = $state();
  const scaleX = $derived(ctx.imageData ? ctx.imageData.width : 0);
  const scaleY = $derived(ctx.imageData ? ctx.imageData.height : 0);

  export function resetLayerOffset() {
    if (!imageRef) return;

    x = 0;
    y = 0;
  }
</script>

<Layer draggable bind:x bind:y>
  <Group>
    <Image {image} bind:this={imageRef} />
    {#if showMask && mask}
      <!-- Use context mask opacity -->
      <Image image={mask} opacity={ctx.displaySettings.maskOpacity} />
    {/if}
  </Group>

  {#each ctx.annotationFiles as annotationFile}
    {@const layerScale = getImageCoordinateScale(
      annotationFile.coordinateSpace ?? 'normalized',
      scaleX,
      scaleY,
    )}
    {#if annotationFile.visible}
      <Group>
        {#each annotationFile.annotations as annotation}
          {@const color =
            ctx.displaySettings.colorMode === 'file'
              ? annotationFile.color
              : annotation.class
                ? ctx.getClassColor(annotation.class)
                : annotationFile.color}

          {#if annotation.type === 'bbox'}
            <AnnotationRect
              box={annotation}
              {...layerScale}
              showLabels={ctx.drawSettings.showLabels}
              {color}
            />
          {:else if annotation.type === 'polygon'}
            <AnnotationPolygon
              polygon={annotation}
              {...layerScale}
              showLabels={ctx.drawSettings.showLabels}
              {color}
            />
          {/if}
        {/each}
      </Group>
    {/if}
  {/each}
</Layer>

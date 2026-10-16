<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { getContentPaneContext } from '$lib/context/contentPaneContext.svelte';
  import { watch, watchOnce } from 'runed';
  import { onDestroy, onMount } from 'svelte';
  import { Stage } from 'svelte-konva';
  import ImageLayer from './ImageLayer.svelte';
  import EmptyDropZone from './EmptyDropZone.svelte';
  import { scalefade } from '$lib/transitions';
  import { cubicIn } from 'svelte/easing';

  const contentPaneCtx = getContentPaneContext();
  const canvasCtx = getCanvasContext();

  let isMounted = $state(false);
  let stageRef: ReturnType<typeof Stage> | undefined = $state();
  let layerRef: ReturnType<typeof ImageLayer> | undefined = $state();
  let isDraggingOver = $state(false);

  const { w: width, h: height } = $derived(contentPaneCtx);

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = true;
  }
  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
  }
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDraggingOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) await canvasCtx.importFiles(files);
  }
  function resetStageZoom(imgWidth: number, imgHeight: number) {
    if (!stageRef) return;
    const stage = stageRef.node;

    const paneWidth = contentPaneCtx.w;
    const paneHeight = contentPaneCtx.h;

    const INIT_PANE_IMG_MARGIN = 20;
    const TOTAL_INIT_PANE_IMG_MARGIN = INIT_PANE_IMG_MARGIN * 2;

    const availableWidth = paneWidth - TOTAL_INIT_PANE_IMG_MARGIN;
    const availableHeight = paneHeight - TOTAL_INIT_PANE_IMG_MARGIN;

    let newScale = 1;

    if (imgWidth > availableWidth || imgHeight > availableHeight) {
      const scaleX = availableWidth / imgWidth;
      const scaleY = availableHeight / imgHeight;
      newScale = Math.min(scaleX, scaleY);
    }

    const scaledWidth = imgWidth * newScale;
    const scaledHeight = imgHeight * newScale;

    // position where (0,0) of stage content should appear
    const x = (paneWidth - scaledWidth) / 2;
    const y = (paneHeight - scaledHeight) / 2;

    // set scale FIRST at origin, then offset
    stage.scale({ x: newScale, y: newScale });
    stage.position({ x, y });

    // update globally tracked line stroke width
    canvasCtx.recalculateLineStroke(newScale, newScale);

    stage.batchDraw();
    layerRef?.resetLayerOffset();
  }

  watchOnce(
    () => stageRef,
    () => {
      if (!stageRef) {
        return;
      }
      const stage = stageRef.node;
      const scaleBy = 1.0337;
      stage.on('wheel', (e) => {
        // stop default scrolling
        e.evt.preventDefault();

        const oldScale = stage.scaleX();
        const pointer = stage.getPointerPosition();
        if (!pointer) {
          return;
        }

        const mousePointTo = {
          x: (pointer.x - stage.x()) / oldScale,
          y: (pointer.y - stage.y()) / oldScale,
        };

        // how to scale? Zoom in? Or zoom out?
        let direction = e.evt.deltaY > 0 ? 1 : -1;

        // when we zoom on trackpad, e.evt.ctrlKey is true
        // in that case lets revert direction
        if (e.evt.ctrlKey) {
          direction = -direction;
        }

        const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

        stage.scale({ x: newScale, y: newScale });

        // update globally tracked line stroke width
        canvasCtx.recalculateLineStroke(newScale, newScale);

        const newPos = {
          x: pointer.x - mousePointTo.x * newScale,
          y: pointer.y - mousePointTo.y * newScale,
        };
        stage.position(newPos);
      });
    },
  );

  watch(
    () => canvasCtx.imageData,
    () => {
      if (canvasCtx.imageData?.canvasElement) {
        resetStageZoom(canvasCtx.imageData.width, canvasCtx.imageData.height);
      }
    },
  );

  onMount(() => {
    isMounted = true;
  });
  onDestroy(() => {
    if (!stageRef) {
      return;
    }
    const stage = stageRef.node;
    stage.off('wheel');
  });
</script>

<div class="relative">
  <!-- 
    isMounted does 2 things:
    1) prevent SSR issues by dynamically rendering konva's components (and ours that are using konva)
    2) lets us have a nice "onload" animation for the pane

    number 1) is SUPER IMPORTANT, we cannot run konva during SSR
  -->
  {#if isMounted}
    <div
      role="region"
      aria-label="Annotation canvas"
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      class="absolute top-0 left-0 overflow-hidden rounded-2xl border border-border bg-sidebar/60"
      class:drop-highlight={isDraggingOver}
      style={`
        width: ${width}px;
        height: ${height}px;
      `}
      in:scalefade={{ duration: 500, easing: cubicIn }}
    >
      <div class="absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-col gap-2">
        {#if canvasCtx.isImporting}
          <p class="rounded-md bg-background px-3 py-2 text-sm" role="status">Importing files…</p>
        {/if}
        {#if canvasCtx.importErrors.length}
          <div
            class="max-h-48 overflow-auto rounded-md border border-destructive bg-background p-3 text-sm"
            role="alert"
          >
            <p class="font-medium">Import failed</p>
            <ul class="list-inside list-disc">
              {#each canvasCtx.importErrors as error}<li>{error}</li>{/each}
            </ul>
            <button class="mt-2 underline" onclick={() => canvasCtx.dismissImportErrors()}
              >Dismiss</button
            >
          </div>
        {/if}
      </div>
      <Stage bind:this={stageRef} {width} {height}>
        {#if canvasCtx.imageData}
          <ImageLayer
            image={canvasCtx.imageData.canvasElement}
            mask={canvasCtx.maskData?.canvasElement}
            bind:this={layerRef}
          />
        {:else}
          <div style="height: {height}px;">
            <EmptyDropZone />
          </div>
        {/if}
      </Stage>
    </div>
  {/if}
</div>

<style>
  .drop-highlight {
    outline: 1.5px dashed var(--primary);
    outline-offset: 2px;
  }
</style>

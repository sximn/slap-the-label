<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';

  const ctx = getCanvasContext();
</script>

{#if ctx.imageFileName || ctx.annotationFiles.length > 0}
  <div class="mt-3 space-y-2 text-xs">
    {#if ctx.imageFileName}
      <div class="flex items-start gap-2 text-muted-foreground">
        <svg
          class="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <span class="break-all">{ctx.imageFileName}</span>
      </div>
    {/if}
    {#each ctx.annotationFiles as file}
      <div class="flex items-start gap-2 text-muted-foreground">
        <svg
          class="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span class="break-all">{file.name}</span>
      </div>
    {/each}
  </div>
{/if}

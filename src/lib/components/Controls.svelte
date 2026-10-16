<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';

  const ctx = getCanvasContext();

  function handleLineWidthChange(event: Event) {
    const target = event.target as HTMLInputElement;
    ctx.setLineWidth(parseInt(target.value));
  }

  function handleLabelsToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    ctx.setShowLabels(target.checked);
  }
</script>

<div class="space-y-4">
  <div class="space-y-2">
    <label class="flex items-center justify-between" for="lineWidth">
      <span class="text-sm text-muted-foreground">Line Width</span>
      <span class="font-mono text-xs text-muted-foreground">{ctx.drawSettings.lineWidth}px</span>
    </label>
    <input
      id="lineWidth"
      type="range"
      min="1"
      max="10"
      step="1"
      value={ctx.drawSettings.lineWidth}
      oninput={handleLineWidthChange}
      class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary"
    />
  </div>

  <label class="flex cursor-pointer items-center gap-3">
    <input
      type="checkbox"
      checked={ctx.drawSettings.showLabels}
      onchange={handleLabelsToggle}
      class="h-4 w-4 cursor-pointer rounded accent-primary"
    />
    <span class="text-sm text-muted-foreground">Show Labels</span>
  </label>
</div>

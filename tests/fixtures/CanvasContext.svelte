<script lang="ts">
  import { createCanvasContext, type CanvasContext } from '$lib/context/canvasContext.svelte';

  let { capture }: { capture: (context: CanvasContext) => void } = $props();

  capture(createCanvasContext());
</script>

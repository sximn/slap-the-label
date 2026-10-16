<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../app.css';
  import { ModeWatcher } from 'mode-watcher';
  import { createCanvasContext } from '$lib/context/canvasContext.svelte';
  import { createContentPaneContext } from '$lib/context/contentPaneContext.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  let { children }: { children?: Snippet } = $props();

  const ctx = createCanvasContext();
  const contentPaneCtx = createContentPaneContext();
</script>

<ModeWatcher />
<Tooltip.Provider>
  {@render children?.()}
</Tooltip.Provider>

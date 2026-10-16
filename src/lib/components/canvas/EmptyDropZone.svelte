<script lang="ts">
  import { cn } from '$lib/utils';
  import FileImportButton from '../FileImportButton.svelte';

  let { class: className }: { class?: string } = $props();
</script>

<div
  class={cn(
    className,
    'flex size-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground',
  )}
>
  <FileImportButton label="" size="icon-lg" />
  <p class="text-center text-sm">Drop files here or use Upload in the sidebar.</p>
  <p class="text-center text-xs">Change how a file is interpreted in History.</p>
</div>

<script lang="ts">
  import { UploadIcon } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let { class: className }: { class?: string } = $props();
</script>

<div
  class={cn(
    className,
    'flex size-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground',
  )}
>
  <UploadIcon class="size-7" />
  <p class="text-center text-sm">Drop files here or use Import in the sidebar.</p>
  <p class="text-center text-xs">Change how a file is interpreted in History.</p>
</div>

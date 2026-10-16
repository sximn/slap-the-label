<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { IMPORT_ACCEPT } from '$lib/utils/files/loader';
  import { Button, type ButtonProps } from '$lib/components/ui/button';
  import { Upload } from '@lucide/svelte';

  let {
    label = 'Upload',
    class: className,
    ...restProps
  }: ButtonProps & { label?: string } = $props();

  let fileInput = $state<HTMLInputElement>();
  const ctx = getCanvasContext();
  const disabled = $derived(ctx.isImporting);
</script>

<Button
  {...restProps}
  variant="outline"
  class={className}
  {disabled}
  onclick={() => fileInput?.click()}
>
  <Upload />
  {label}
</Button>
<input
  bind:this={fileInput}
  hidden
  type="file"
  accept={IMPORT_ACCEPT}
  multiple
  {disabled}
  onchange={async (event) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    await ctx.importFiles(files);
    input.value = '';
  }}
/>

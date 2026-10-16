<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { loadImage } from '$lib/utils/files/imageLoader';
  import ReflectedButton from './shared/ReflectedButton.svelte';

  const ctx = getCanvasContext();
  let fileInputElement: HTMLInputElement | null = null;

  $effect(() => {
    if (!ctx.imageData) {
      if (fileInputElement) {
        fileInputElement.value = '';
      }
    }
  });

  function openFilePicker() {
    fileInputElement?.click();
  }

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const imageData = await loadImage(file);
      ctx.setImage(imageData.imageData, file.name);
    } catch (error) {
      alert('Failed to load image: ' + (error as Error).message);
    }
  }
</script>

<ReflectedButton onclick={openFilePicker}>
  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  </svg>
  <span class="text-sm font-medium">Choose Image</span>
</ReflectedButton>
<input
  type="file"
  bind:this={fileInputElement}
  accept="image/*,.tif,.tiff"
  onchange={handleFileChange}
  class="hidden"
/>

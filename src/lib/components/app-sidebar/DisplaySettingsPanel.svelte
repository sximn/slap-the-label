<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { Label } from '$lib/components/ui/label';
  import { Slider } from '$lib/components/ui/slider';
  import * as RadioGroup from '$lib/components/ui/radio-group';
  import * as Select from '$lib/components/ui/select';
  import { Separator } from '$lib/components/ui/separator';
  import { Eye, EyeOff } from '@lucide/svelte';
  import { isMaskVisualizationType } from '$lib/types';
  import { isImageCoordinateSpace } from '$lib/utils/coordinates';
  import RasterPreviewControls from './RasterPreviewControls.svelte';

  const ctx = getCanvasContext();

  let uniqueClasses = $derived.by(() => {
    const classes = new Set<string>();
    ctx.annotationFiles.forEach((file) => {
      file.annotations.forEach((ann) => {
        if (ann.class) classes.add(ann.class);
      });
    });
    return Array.from(classes).sort();
  });

  const maskVisualizationOptions = [
    { value: 'normal', label: 'Normal' },
    { value: 'solid', label: 'Solid Color' },
  ];
  const emptyMaskVizSelectVal = 'Select Mask Visualization' as const;
  let maskVisualizationValue = $state('');
  const triggerContent = $derived(
    maskVisualizationOptions.find((f) => f.value === maskVisualizationValue)?.label ??
      emptyMaskVizSelectVal,
  );
</script>

<div class="space-y-6">
  <div class="space-y-4">
    <h3 class="text-sm font-medium tracking-wide text-foreground/70 uppercase">Annotation Style</h3>

    <div class="space-y-2">
      <Label>Color Mode</Label>
      <RadioGroup.Root
        value={ctx.displaySettings.colorMode}
        onValueChange={(v) => ctx.setDisplaySettings({ colorMode: v as 'file' | 'class' })}
        class="flex gap-4"
      >
        <div class="flex items-center space-x-2">
          <RadioGroup.Item value="file" id="mode-file" />
          <Label for="mode-file" class="cursor-pointer font-normal">By File</Label>
        </div>
        <div class="flex items-center space-x-2">
          <RadioGroup.Item value="class" id="mode-class" />
          <Label for="mode-class" class="cursor-pointer font-normal">By Class</Label>
        </div>
      </RadioGroup.Root>
    </div>

    <!-- Stroke Width (This actually updates drawSettings, but it's a display setting too) -->
    <!--  Currently ctx.drawSettings.lineWidth is used for NEW drawings.
          We might want a global override or just update that value.
          For now let's reuse drawSettings.lineWidth but consider it affects rendering. -->
    <div class="space-y-2">
      <div class="flex justify-between">
        <Label>Stroke Width</Label>
        <span class="text-xs text-muted-foreground">{ctx.drawSettings.lineWidth}px</span>
      </div>
      <Slider
        type="single"
        value={ctx.drawSettings.lineWidth}
        min={1}
        max={10}
        step={0.5}
        onValueChange={(v) => ctx.setLineWidth(v as any as number)}
      />
    </div>
  </div>

  <Separator />

  {#if ctx.imageData?.raster}
    <RasterPreviewControls data={ctx.imageData} target="image" />
    <Separator />
  {/if}

  <div class="space-y-4">
    <h3 class="text-sm font-medium tracking-wide text-foreground/70 uppercase">
      {ctx.displaySettings.colorMode === 'file' ? 'Files' : 'Classes'}
    </h3>

    {#if ctx.displaySettings.colorMode === 'file'}
      <div class="space-y-2">
        {#each ctx.annotationFiles as file}
          <div class="group flex items-center justify-between gap-2 text-sm">
            <div class="flex items-center gap-2 overflow-hidden">
              <button
                class="text-muted-foreground transition-colors hover:text-foreground"
                onclick={() => ctx.toggleAnnotationFile(file.name)}
              >
                {#if file.visible}
                  <Eye size={14} />
                {:else}
                  <EyeOff size={14} />
                {/if}
              </button>

              <input
                type="color"
                class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                value={file.color}
                onchange={(e) => {
                  // We need a method to update file color in context/history?
                  // For now direct mutation if allowed, but ideally via context method
                  // file.color = e.currentTarget.value;
                  // Use context action effectively
                  // ctx.updateFileColor(file.name, e.currentTarget.value);
                  // Since that method doesn't exist yet, I will add a TODO or just direct mutate for MVP if context allows deep reactivity
                  file.color = e.currentTarget.value;
                }}
              />

              <span class="block max-w-[120px] truncate" title={file.name}>{file.name}</span>
            </div>
          </div>
        {/each}
        {#if ctx.annotationFiles.length === 0}
          <div class="text-xs text-muted-foreground italic">No annotation files loaded.</div>
        {/if}
      </div>
    {:else}
      <div class="space-y-2">
        {#each uniqueClasses as className}
          {@const color = ctx.getClassColor(className)}
          <div class="flex items-center justify-between gap-2 text-sm">
            <div class="flex items-center gap-2">
              <input
                type="color"
                class="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                value={color}
                onchange={(e) => ctx.setClassColor(className, e.currentTarget.value)}
              />
              <span class="block max-w-[120px] truncate">{className}</span>
            </div>
          </div>
        {/each}
        {#if uniqueClasses.length === 0}
          <div class="text-xs text-muted-foreground italic">No classes found.</div>
        {/if}
      </div>
    {/if}
  </div>

  <Separator />

  {#if ctx.annotationFiles.some((file) => file.coordinateSpace)}
    <div class="space-y-4">
      <h3 class="text-sm font-medium tracking-wide text-foreground/70 uppercase">
        GeoJSON coordinates
      </h3>
      {#each ctx.annotationFiles as file}
        {#if file.coordinateSpace}
          <label class="flex flex-col gap-1 text-sm">
            <span class="truncate" title={file.name}>{file.name}</span>
            <select
              class="rounded-md border border-border bg-background px-2 py-1 text-sm"
              aria-label={`Coordinate space for ${file.name}`}
              value={file.coordinateSpace}
              onchange={(event) => {
                const value = event.currentTarget.value;
                if (isImageCoordinateSpace(value)) {
                  ctx.setAnnotationCoordinateSpace(file.name, value);
                }
              }}
            >
              <option value="pixel">Image pixels</option>
              <option value="normalized">Normalized image coordinates (0–1)</option>
            </select>
          </label>
        {/if}
      {/each}
      <p class="text-xs text-muted-foreground">
        Geographic coordinates must be converted to image coordinates before import.
      </p>
    </div>
    <Separator />
  {/if}

  <div class="space-y-4">
    <h3 class="text-sm font-medium tracking-wide text-foreground/70 uppercase">Masks</h3>

    <p class="text-xs text-muted-foreground">
      Masks must match the image size. Change an import's interpretation in History.
    </p>
    {#if ctx.maskData?.raster}
      <RasterPreviewControls data={ctx.maskData} target="mask" />
    {/if}

    <div class="space-y-2">
      <div class="flex justify-between">
        <Label>Opacity</Label>
        <span class="text-xs text-muted-foreground"
          >{Math.round(ctx.displaySettings.maskOpacity * 100)}%</span
        >
      </div>
      <Slider
        type="single"
        value={ctx.displaySettings.maskOpacity}
        min={0}
        max={1}
        step={0.05}
        onValueChange={(v) => ctx.setDisplaySettings({ maskOpacity: v as any as number })}
      />
    </div>

    <!-- TODO: For now we comment this out
          And we only support opacity of the mask
          Later we migh include more options
      -->
    <!-- <div class="space-y-2">
      <Label>Visualization</Label>
      <Select.Root
        type="single"
        bind:value={maskVisualizationValue}
        onValueChange={(v) => {
          if (isMaskVisualizationType(v)) {
            ctx.setDisplaySettings({ maskVisualization: v });
          }
        }}
      >
        <Select.Trigger class="w-full min-w-fit border border-border">
          {triggerContent}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="">{emptyMaskVizSelectVal}</Select.Item>
          {#each maskVisualizationOptions as option (option.value)}
            <Select.Item value={option.value} label={option.label}>
              {option.label}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div> -->
  </div>
</div>

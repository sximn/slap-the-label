<script lang="ts">
  import {
    type HistoryEntry,
    getCanvasContext,
    type HistoryActionType,
  } from '$lib/context/canvasContext.svelte';
  import { cn } from '$lib/utils';
  import {
    Image as ImageIcon,
    ScanFace,
    FilePlus,
    FileMinus,
    Eye,
    EyeOff,
    Eraser,
    Circle,
    CircleAlert,
    type Icon as IconType,
  } from '@lucide/svelte';
  import { slide, scale } from 'svelte/transition';
  import { backOut, cubicOut, linear } from 'svelte/easing';
  import type { Attachment } from 'svelte/attachments';
  import ImportRolePopover from './ImportRolePopover.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip';

  interface Props {
    historyEntry: HistoryEntry;
    index: number;
    isOverlay?: boolean;
    isActive?: boolean;
    isFuture?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    refAttachment?: Attachment;
    isDragging?: boolean;
  }

  let {
    historyEntry,
    index,
    isOverlay = false,
    isActive = false,
    isFuture = false,
    isFirst = false,
    isLast = false,
    refAttachment = () => {},
    isDragging = false,
  }: Props = $props();

  const ctx = getCanvasContext();

  const TYPE_ICONS: Record<HistoryActionType | 'default', typeof IconType> = {
    import: ImageIcon,
    'import-role': ScanFace,
    image: ImageIcon,
    mask: ScanFace,
    'raster-preview': ScanFace,
    annotation: FilePlus,
    visibility: Eye,
    coordinates: ScanFace,
    clear: Eraser,
    default: Circle,
  };

  function getIcon(type: HistoryActionType, label: string) {
    if (type === 'annotation') {
      return label.startsWith('Remove') ? FileMinus : FilePlus;
    }
    if (type === 'visibility') {
      return label.startsWith('Hide') ? EyeOff : Eye;
    }
    return TYPE_ICONS[type] || TYPE_ICONS.default;
  }

  const importRole = $derived(ctx.getImportRole(historyEntry.timestamp));
  const error = $derived(ctx.getHistoryError(historyEntry.timestamp));
  const Icon = $derived(getIcon(importRole ?? historyEntry.type, historyEntry.label));
</script>

<div
  class={cn('relative touch-none', isOverlay && 'z-50')}
  {@attach refAttachment}
  data-history-index={index}
>
  <div
    class={cn(
      'group flex w-full items-stretch gap-2 rounded-md py-0 pr-2 text-left text-sm transition-colors',
      'hover:bg-accent/50',
      isActive && 'bg-accent font-medium text-accent-foreground dark:bg-accent/40',
      isDragging && 'opacity-0', // Hide original when dragging
      isOverlay && 'bg-background opacity-100 shadow-lg ring-1 ring-border', // Show overlay with style
    )}
  >
    <button
      class="relative flex w-8 shrink-0 flex-col items-center"
      onclick={() => !isDragging && ctx.jumpTo(index)}
      type="button"
      aria-label="History item"
      aria-disabled={isDragging}
      tabindex="-1"
    >
      {#if !isFirst && !isFuture}
        <div
          class="absolute top-0 h-1/2 w-px bg-muted-foreground/20 dark:bg-muted-foreground/40"
          in:slide={{ delay: 200, duration: 500, easing: backOut }}
          out:slide={{ duration: 100, axis: 'y', easing: linear }}
        ></div>
      {/if}

      {#if !(isActive && !isLast) && !isFuture && !isLast}
        <div
          class="absolute top-6/12 h-1/2 w-px bg-muted-foreground/20 dark:bg-muted-foreground/40"
          in:slide={{ duration: 200, axis: 'y', easing: linear }}
          out:slide={{ delay: 100, duration: 50, easing: linear }}
        ></div>
      {/if}

      <div
        class={cn(
          'z-10 my-3 flex size-2.5 shrink-0 items-center justify-center rounded-full border bg-background transition-colors duration-300',
          isActive
            ? 'scale-110 border-primary bg-primary'
            : 'border-muted-foreground bg-muted-foreground',
          isFuture && 'opacity-50',
        )}
        in:scale={{ duration: 300, delay: 150, easing: cubicOut, start: 0 }}
      ></div>
    </button>

    <div
      class={cn(
        'flex min-w-0 flex-1 items-center gap-1',
        isFuture && 'opacity-50 grayscale transition-opacity duration-300',
      )}
    >
      {#if historyEntry.type === 'import' && !isOverlay}
        <ImportRolePopover
          importId={historyEntry.timestamp}
          name={historyEntry.payload.source.name}
          icon={Icon}
          disabled={isDragging}
        />
      {:else}
        <span class="flex size-7 shrink-0 items-center justify-center">
          <Icon class="size-4 text-muted-foreground/70" />
        </span>
      {/if}
      <button
        class="min-w-0 flex-1 truncate py-2 text-left outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring"
        onclick={() => !isDragging && ctx.jumpTo(index)}
        type="button"
        aria-label={`Go to history step: ${historyEntry.label}`}
        aria-disabled={isDragging}
        tabindex="-1">{historyEntry.label}</button
      >
    </div>
    {#if error && historyEntry.type !== 'import' && !isOverlay}
      <Tooltip.Root>
        <Tooltip.Trigger aria-label={error} class="self-center text-destructive">
          <CircleAlert class="size-4" />
        </Tooltip.Trigger>
        <Tooltip.Content side="left">{error}</Tooltip.Content>
      </Tooltip.Root>
    {/if}
  </div>
</div>

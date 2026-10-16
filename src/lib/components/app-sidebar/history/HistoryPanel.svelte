<script lang="ts">
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { CircleAlert, History } from '@lucide/svelte';
  import NukeHistoryButton from './NukeHistoryButton.svelte';
  import HistorySortableList from './HistorySortableList.svelte';
  import ImportRolePopover from './ImportRolePopover.svelte';

  const ctx = getCanvasContext();
</script>

<div class="flex flex-col gap-2 p-4">
  <div
    class="mb-1 flex items-center justify-between gap-2 px-2 text-sm font-semibold text-muted-foreground"
  >
    <div class="inline-flex items-center gap-2">
      <History class="size-4" />
      <span>History</span>
    </div>
    <NukeHistoryButton />
  </div>

  {#if ctx.history.length === 0}
    <div class="px-2 text-xs text-muted-foreground italic">No history yet</div>
  {:else}
    <HistorySortableList />
  {/if}

  {#if ctx.failedImports.length > 0}
    <div class="mt-2 space-y-2 border-t border-border pt-3">
      <h3 class="px-2 text-xs font-semibold text-muted-foreground">Failed imports</h3>
      {#each ctx.failedImports as attempt (attempt.timestamp)}
        <div class="flex items-start gap-2 px-2 text-sm">
          <ImportRolePopover
            importId={attempt.timestamp}
            name={attempt.source.name}
            isActive={false}
            icon={CircleAlert}
            disabled={ctx.isImporting}
          />
          <div class="min-w-0 flex-1">
            <p class="truncate" title={attempt.source.name}>{attempt.source.name}</p>
            <p class="text-xs text-destructive">{ctx.getHistoryError(attempt.timestamp)}</p>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

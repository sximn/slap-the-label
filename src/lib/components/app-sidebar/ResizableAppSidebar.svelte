<script lang="ts">
  import * as Resizable from '$lib/components/ui/resizable';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import { getContentPaneContext } from '$lib/context/contentPaneContext.svelte';
  import type { Snippet } from 'svelte';
  import LightSwitch from '$lib/components/ui/light-switch/light-switch.svelte';
  import HistoryPanel from './history/HistoryPanel.svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import { PanelRightClose, PanelRightOpen, History, Settings2, Trash2 } from '@lucide/svelte';
  import { cmdOrCtrl } from '$lib/hooks/is-mac.svelte';
  import DisplaySettingsPanel from './DisplaySettingsPanel.svelte';
  import { Button } from '../ui/button';

  const INITIAL_OPEN = true;
  const MIN_PIXEL_SIZE = 220;

  const ctx = getCanvasContext();
  const paneCtx = getContentPaneContext();

  let { children }: { children: Snippet } = $props();

  let sidebarPane: ReturnType<typeof Resizable.Pane>;
  let isPaneCollapsed = $state(!INITIAL_OPEN);
  let isSidebarOpen = $state(INITIAL_OPEN);
  let isResizing = $state(false);
  let innerWidth = $state(0);

  const sidebarDefaultSize = $derived(
    paneCtx.isMobile ? 0 : Math.round((MIN_PIXEL_SIZE / innerWidth) * 100),
  );

  function handlePaneCollapse() {
    isPaneCollapsed = true;
    isSidebarOpen = false;
  }

  function handlePaneExpand() {
    isPaneCollapsed = false;
    isSidebarOpen = true;
  }

  function handleClear() {
    ctx.clearAll();
  }

  function handleDownload() {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'yolo-overlay.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function handleKeydown(e: KeyboardEvent) {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;

    // Undo: Cmd+Z or Ctrl+Z
    if (isCmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      ctx.undo();
      return;
    }

    // Redo: Cmd+Shift+Z or Ctrl+Y
    if (
      (isCmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') ||
      (isCmdOrCtrl && e.key.toLowerCase() === 'y')
    ) {
      e.preventDefault();
      ctx.redo();
      return;
    }
  }

  $effect(() => {
    if (isSidebarOpen && isPaneCollapsed) {
      return sidebarPane.expand();
    }
    if (!isSidebarOpen && !isPaneCollapsed) {
      sidebarPane.collapse();
    }
  });
</script>

<svelte:window bind:innerWidth onkeydown={handleKeydown} />

<Sidebar.Provider bind:open={isSidebarOpen}>
  <Resizable.PaneGroup direction="horizontal">
    <Resizable.Pane class="flex flex-col">
      {@render children()}
    </Resizable.Pane>

    <Resizable.Handle
      onDraggingChange={(isDragging) => {
        isResizing = isDragging;
      }}
    />
    <div class="relative">
      <div
        class="absolute top-6 right-0 rounded-l-md border-t-1 border-b-1 border-l-1 border-border bg-sidebar"
      >
        {@render tooltippedSidebarTrigger()}
      </div>
    </div>

    <Resizable.Pane
      defaultSize={sidebarDefaultSize}
      minSize={10}
      maxSize={50}
      collapsible={true}
      class={`${!isResizing ? 'transition-discrete data-[state=closed]:duration-500 data-[state=open]:duration-300' : ''}`}
      data-state={isSidebarOpen ? 'open' : 'closed'}
      onCollapse={handlePaneCollapse}
      onExpand={handlePaneExpand}
      bind:this={sidebarPane}
    >
      <Sidebar.Root
        class="static! w-full! [contain:layout_style_paint]"
        style="min-width: {MIN_PIXEL_SIZE}px;"
        side="left"
      >
        <Sidebar.Content class="mx-auto mt-4 w-full max-w-[24rem] rounded-sm border border-border">
          <Tabs.Root value="history" class="flex h-full flex-col">
            <div class="px-2 pt-2">
              <Tabs.List class="grid w-full grid-cols-2">
                <Tabs.Trigger value="history" class="gap-2">
                  <History size={16} /> History
                </Tabs.Trigger>
                <Tabs.Trigger value="display" class="gap-2">
                  <Settings2 size={16} /> Display
                </Tabs.Trigger>
              </Tabs.List>
            </div>

            <Tabs.Content value="history" class="flex-1 overflow-hidden pt-2">
              <HistoryPanel />
            </Tabs.Content>

            <Tabs.Content value="display" class="flex-1 overflow-y-auto p-4 pt-2">
              <DisplaySettingsPanel />
            </Tabs.Content>
          </Tabs.Root>
        </Sidebar.Content>

        <Sidebar.Footer>
          <Sidebar.Group class="items- w-full flex-row justify-end gap-2">
            <Button onclick={handleClear} variant="outline">
              <Trash2 />
              Clear Pane
            </Button>
            <LightSwitch />
          </Sidebar.Group>
        </Sidebar.Footer>

        <Sidebar.Rail />
      </Sidebar.Root>
    </Resizable.Pane>
  </Resizable.PaneGroup>
</Sidebar.Provider>

{#snippet tooltippedSidebarTrigger()}
  {#if paneCtx.isMobile}
    {@render _sidebarTrigger({})}
  {:else}
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          {@render _sidebarTrigger({ props })}
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content
        side="bottom"
        align="start"
        alignOffset={4}
        arrowClasses="hidden"
        sideOffset={4}
      >
        Open sidebar <kbd>{cmdOrCtrl}</kbd> + <kbd>B</kbd>
      </Tooltip.Content>
    </Tooltip.Root>
  {/if}
{/snippet}

{#snippet _sidebarTrigger({ props }: { props?: Record<string, unknown> })}
  <Sidebar.Trigger {...props} class="rounded-r-none dark:hover:bg-muted">
    {#snippet child()}
      {#if isSidebarOpen}
        <PanelRightClose class="text-muted-foreground" />
      {:else}
        <PanelRightOpen class="text-muted-foreground" />
      {/if}
      <span class="sr-only">Toggle Sidebar</span>
    {/snippet}
  </Sidebar.Trigger>
{/snippet}

<style>
  kbd {
    background-color: #dfdfef;
    border-radius: 3px;
    border: 1px solid #b4b4b4;
    box-shadow:
      0 1px 1px rgb(0 0 0 / 0.2),
      0 2px 0 0 rgb(255 255 255 / 0.7) inset;
    color: #333333;
    display: inline-block;
    font-size: 0.85em;
    font-weight: 700;
    line-height: 1;
    padding: 2px 4px;
    white-space: nowrap;
  }
</style>

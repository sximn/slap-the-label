<script lang="ts">
  import { Popover, Tooltip as TooltipPrimitive } from 'bits-ui';
  import { Image, ScanFace, FilePlus, Check, type Icon as IconType } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { getCanvasContext } from '$lib/context/canvasContext.svelte';
  import type { ImportRole } from '$lib/types';

  let {
    importId,
    name,
    icon: Icon,
    disabled = false,
  }: {
    importId: number;
    name: string;
    icon: typeof IconType;
    disabled?: boolean;
  } = $props();

  const roles = [
    { value: 'image', label: 'Image', icon: Image },
    { value: 'mask', label: 'Mask', icon: ScanFace },
    { value: 'annotation', label: 'Annotation', icon: FilePlus },
  ] as const;

  const ctx = getCanvasContext();

  const reasonId = $props.id();

  let open = $state(false);

  const role = $derived(ctx.getImportRole(importId));
  const error = $derived(ctx.getHistoryError(importId));

  const options = $derived(
    roles.map((option) => ({
      ...option,
      reason: open ? ctx.getImportRoleError(importId, option.value) : undefined,
    })),
  );

  const reasons = TooltipPrimitive.createTether<{ reason: string }>();

  function choose(value: ImportRole) {
    if (ctx.getImportRoleError(importId, value)) {
      return;
    }

    ctx.changeImportRole(importId, value);

    if (!ctx.getHistoryError(importId)) {
      open = false;
    }
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger {disabled}>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon-sm"
        class={`size-7 text-muted-foreground hover:text-foreground data-[state=open]:bg-accent ${error ? 'text-destructive' : ''}`}
        aria-label={`Change interpretation of ${name} (currently ${role})`}
        title={`Interpret as ${role}`}
        onpointerdown={(event) => event.stopPropagation()}
        onkeydown={(event) => {
          if ([' ', 'Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) event.stopPropagation();
        }}
      >
        <Icon class="size-4" />
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      side="left"
      align="start"
      sideOffset={8}
      aria-label={`Interpret ${name}`}
      class="z-50 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
    >
      <p class="px-2 py-1.5 text-xs font-medium text-muted-foreground">Interpret as</p>
      {#each options as option (option.value)}
        <Tooltip.Trigger tether={reasons} payload={{ reason: option.reason ?? '' }}>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              class="w-full justify-start aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed"
              aria-disabled={!!option.reason}
              aria-pressed={role === option.value}
              aria-describedby={option.reason ? `${reasonId}-${option.value}` : undefined}
              onclick={() => choose(option.value)}
            >
              <option.icon class="size-4" />
              {option.label}
              {#if role === option.value}<Check class="ml-auto size-4" />{/if}
            </Button>
          {/snippet}
        </Tooltip.Trigger>
        {#if option.reason}
          <span id={`${reasonId}-${option.value}`} class="sr-only">{option.reason}</span>
        {/if}
      {/each}
      {#if error}
        <p class="px-2 py-1.5 text-xs text-destructive" role="alert">{error}</p>
      {/if}
      <Tooltip.Root tether={reasons} disabled={!open}>
        {#snippet children({ payload })}
          {#if payload?.reason}
            <Tooltip.Content side="left" sideOffset={8}>{payload.reason}</Tooltip.Content>
          {/if}
        {/snippet}
      </Tooltip.Root>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

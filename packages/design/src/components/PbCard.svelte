<script lang="ts">
  import type { Snippet } from 'svelte';

  type CardElement = 'article' | 'aside' | 'div' | 'section';

  let {
    children,
    as = 'section',
    ariaLabel,
    dataStatus,
    class: className = '',
  }: {
    children: Snippet;
    as?: CardElement;
    ariaLabel?: string;
    dataStatus?: string;
    class?: string;
  } = $props();
</script>

<svelte:element
  this={as}
  class={`rounded-sm border border-line bg-surface-warm p-5 shadow-[var(--theme-shadow-xs)] ${className}`}
  aria-label={ariaLabel}
  data-status={dataStatus}
>
  {@render children()}
</svelte:element>

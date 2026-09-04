<script lang="ts">
  import type { Snippet } from 'svelte';

  type FieldVariant = 'control' | 'choice';

  let {
    children,
    label,
    hint,
    description,
    variant = 'control',
    class: className = '',
  }: {
    children: Snippet;
    label: string;
    hint?: string;
    description?: string;
    variant?: FieldVariant;
    class?: string;
  } = $props();

  const controlClasses =
    "grid gap-1.5 text-sm font-semibold text-ink [&_input]:mt-1 [&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xs [&_input]:border [&_input]:border-line-strong [&_input]:bg-surface [&_input]:px-3 [&_input]:py-2 [&_input]:text-[max(var(--text-base),16px)] [&_input]:font-normal [&_input:hover]:border-human-text [&_input:focus-visible]:border-focus [&_textarea]:mt-1 [&_textarea]:min-h-11 [&_textarea]:w-full [&_textarea]:rounded-xs [&_textarea]:border [&_textarea]:border-line-strong [&_textarea]:bg-surface [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-[max(var(--text-base),16px)] [&_textarea]:font-normal [&_textarea:hover]:border-human-text [&_textarea:focus-visible]:border-focus [&_select]:mt-1 [&_select]:min-h-11 [&_select]:w-full [&_select]:rounded-xs [&_select]:border [&_select]:border-line-strong [&_select]:bg-surface [&_select]:px-3 [&_select]:py-2 [&_select]:text-[max(var(--text-base),16px)] [&_select]:font-normal [&_select:hover]:border-human-text [&_select:focus-visible]:border-focus";
  const choiceClasses =
    'flex min-h-11 cursor-pointer items-start gap-3 text-sm font-normal text-ink [&_input]:mt-1 [&_input]:size-4 [&_input]:shrink-0';
</script>

<label class={`${variant === 'choice' ? choiceClasses : controlClasses} ${className}`}>
  {#if variant === 'control'}<span>{label}</span>{/if}
  {@render children()}
  {#if variant === 'choice'}
    <span class="min-w-0 leading-snug">
      <span class="block">{label}</span>
      {#if description}<small class="mt-1 block font-normal leading-normal text-muted">{description}</small>{/if}
    </span>
  {/if}
  {#if hint}<small class="font-normal leading-normal text-muted">{hint}</small>{/if}
</label>

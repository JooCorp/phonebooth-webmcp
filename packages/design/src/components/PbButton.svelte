<script lang="ts">
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type Size = 'md' | 'lg';

  let {
    children,
    variant = 'primary',
    size = 'lg',
    type = 'button',
    disabled = false,
    humanOnly = false,
    onclick,
  }: {
    children: Snippet;
    variant?: Variant;
    size?: Size;
    type?: 'button' | 'submit';
    disabled?: boolean;
    humanOnly?: boolean;
    onclick?: (event: MouseEvent) => void;
  } = $props();

  const variants: Record<Variant, string> = {
    primary:
      'border-transparent bg-human text-inverse shadow-[var(--theme-shadow-cta)] hover:-translate-y-px hover:bg-human-hover hover:shadow-[var(--theme-shadow-cta-hover)] active:translate-y-0 active:scale-[0.98]',
    secondary:
      'border-agent bg-agent text-inverse hover:brightness-95 active:translate-y-px',
    ghost:
      'border-line bg-transparent text-muted hover:border-line-strong hover:bg-subtle hover:text-ink',
    danger:
      'border-error bg-error text-inverse hover:brightness-95 active:translate-y-px',
  };
  const sizes: Record<Size, string> = {
    md: 'min-h-11 rounded-xs px-4 text-sm',
    lg: 'h-14 rounded-lg px-8 text-base',
  };
</script>

<button
  {type}
  {disabled}
  {onclick}
  data-human-only={humanOnly ? '' : undefined}
  class={`inline-flex cursor-pointer items-center justify-center border font-bold tracking-[-0.2px] whitespace-nowrap transition-[transform,background-color,border-color,box-shadow,color,filter] duration-[220ms] ease-[var(--ease-default)] focus-visible:shadow-[var(--theme-focus-ring)] disabled:cursor-not-allowed disabled:opacity-[0.55] ${sizes[size]} ${variants[variant]}`}
>
  {@render children()}
</button>

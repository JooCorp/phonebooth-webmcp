<script lang="ts">
  // Local-only portrait art brief: ../../../../../.local/callee-avatars.json
  let {
    size = 'md',
  }: {
    size?: 'sm' | 'md';
  } = $props();

  const sizeClasses = {
    sm: 'size-11',
    md: 'size-12',
  } as const;
</script>

<span
  class={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-human/25 bg-human-soft text-human-text shadow-[var(--theme-shadow-xs)] ${sizeClasses[size]}`}
  aria-hidden="true"
>
  <svg class="h-[68%] w-[68%]" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="18" r="8" fill="currentColor" opacity="0.72" />
    <path
      d="M10.5 41c.8-8.2 6.1-13 13.5-13s12.7 4.8 13.5 13"
      fill="currentColor"
      opacity="0.72"
    />
    <path d="M7 41h34" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.35" />
  </svg>
</span>

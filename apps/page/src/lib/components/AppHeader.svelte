<script lang="ts">
  import { PbWordmark } from '@phonebooth/design';

  const callsRemaining = '∞';
</script>

<header class="relative z-10 border-b border-line-subtle bg-app/90 backdrop-blur-sm">
  <div class="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2 sm:px-8">
    <div aria-label="Phonebooth"><PbWordmark compact /></div>
    <div
      class="inline-flex min-h-9 items-center gap-2 rounded-full border border-time/30 bg-time-soft px-3.5 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wide)] text-time uppercase"
      aria-label="Unlimited call credits remaining"
    >
      <span class="text-xl leading-none text-ink" aria-hidden="true">{callsRemaining}</span>
      <span>Calls remaining</span>
    </div>
  </div>
</header>

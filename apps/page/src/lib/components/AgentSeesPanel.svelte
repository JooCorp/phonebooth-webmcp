<script lang="ts">
  import { PbCard } from '@phonebooth/design';

  let {
    available,
  }: {
    available: boolean;
  } = $props();
</script>

<PbCard as="section" ariaLabel="Your agent" class="flex h-full flex-col p-5 sm:p-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
      Your agent
    </p>
    <span
      class={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wide)] uppercase ${available ? 'border-success/25 bg-success-soft text-success-text' : 'border-line bg-subtle text-muted'}`}
      role="status"
    >
      <span class={`h-2 w-2 rounded-full ${available ? 'bg-success' : 'bg-faint'}`} aria-hidden="true"></span>
      {available ? 'Connected' : 'Not connected'}
    </span>
  </div>

  <h3 class="mt-5 mb-0 text-xl tracking-tight text-ink">Ask your agent to call</h3>
  <p class="mt-3 mb-0 text-sm leading-relaxed text-muted">
    {#if available}
      Ask your agent to make a phone call. Its request will appear here.
    {:else}
      Connect your agent to send call requests to Phonebooth.
    {/if}
  </p>
</PbCard>

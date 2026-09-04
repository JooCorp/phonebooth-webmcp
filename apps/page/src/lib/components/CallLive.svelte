<script lang="ts">
  import { PbButton, PbCard } from '@phonebooth/design';

  export type CallLiveState = {
    calleeLabel: string;
    objective: string;
    elapsedSeconds?: number;
  };

  let {
    call,
    onBack,
  }: {
    call: CallLiveState;
    onBack: () => void;
  } = $props();

  function elapsed(seconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
  }
</script>

<section class="mx-auto flex w-full max-w-2xl flex-col items-center text-center" aria-labelledby="live-call-title">
  <div
    class="inline-flex min-h-9 items-center gap-2 rounded-full border border-time/30 bg-time-soft px-4 font-[var(--font-mono)] text-xs font-semibold tracking-[var(--tracking-widest)] text-time uppercase"
    role="status"
    aria-live="polite"
  >
    <span class="h-2 w-2 shrink-0 rounded-full bg-time" aria-hidden="true"></span>
    Call in progress
  </div>

  <h1 id="live-call-title" class="mt-6 mb-0 text-3xl tracking-tight text-ink sm:text-4xl">
    Your agent is on the call.
  </h1>
  <p class="mt-4 mb-0 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
    JooVoice is handling the conversation. There is nothing you need to do right now.
  </p>

  <div class="mt-8 w-full">
    <PbCard as="section" ariaLabel="Current call" class="w-full p-0 text-left sm:p-0">
      <dl class="m-0">
        <div class="grid gap-1 border-b border-line px-5 py-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:px-6">
          <dt class="font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-faint uppercase">
            Calling
          </dt>
          <dd class="m-0 break-words font-semibold text-ink">{call.calleeLabel}</dd>
        </div>
        <div class="grid gap-1 px-5 py-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-5 sm:px-6">
          <dt class="font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-faint uppercase">
            Goal
          </dt>
          <dd class="m-0 break-words leading-relaxed text-ink">{call.objective}</dd>
        </div>
      </dl>

      {#if call.elapsedSeconds !== undefined}
        <div class="flex min-h-12 items-center justify-between gap-4 border-t border-line bg-time-soft px-5 py-3 sm:px-6">
          <span class="font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-time uppercase">
            Elapsed
          </span>
          <time class="font-[var(--font-mono)] text-sm font-semibold text-ink">
            {elapsed(call.elapsedSeconds)}
          </time>
        </div>
      {/if}
    </PbCard>
  </div>

  <section class="mt-6 w-full rounded-sm border border-agent/25 bg-agent-soft px-5 py-5 text-left sm:px-6" aria-label="What happens next">
    <h2 class="m-0 text-lg text-ink">You can leave this page.</h2>
    <p class="mt-2 mb-0 text-sm leading-relaxed text-muted">
      The call will keep going. When it ends, you’ll find the result, transcript, and recording here in Phonebooth.
    </p>
  </section>

  <div class="mt-6 [&>button]:min-w-40">
    <PbButton size="md" variant="ghost" onclick={onBack}>Back to calls</PbButton>
  </div>
</section>

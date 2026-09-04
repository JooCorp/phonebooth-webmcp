<script lang="ts">
  import { tick } from 'svelte';
  import { PbButton, PbCard } from '@phonebooth/design';
  import { callVerdictPresentation } from '$lib/call-verdict.ts';
  import CalleeAvatar from '$lib/components/CalleeAvatar.svelte';
  import HumanButton from '$lib/components/HumanButton.svelte';
  import QuestionsForm from '$lib/components/QuestionsForm.svelte';
  import {
    formatElapsed,
    formatRequestTime,
    requestPresentation,
    type RequestTone,
  } from '$lib/calls-workspace.ts';
  import { shortId } from '$lib/tools/groups.ts';
  import type { Answer, StatusObject } from '$lib/types.ts';

  let {
    request,
    canCancel = false,
    onAnswer,
    onCancel,
    onPlace,
    onRetry,
    onReportBack,
    onViewResult,
  }: {
    request: StatusObject;
    canCancel?: boolean;
    onAnswer: (id: string, questionSetId: string, answers: Answer[], additionalDetails?: string) => void | Promise<unknown>;
    onCancel: (id: string) => void | Promise<unknown>;
    onPlace: (id: string) => void | Promise<unknown>;
    onRetry: (id: string) => void | Promise<unknown>;
    onReportBack: (id: string) => void | Promise<unknown>;
    onViewResult: (id: string) => void;
  } = $props();

  const short = $derived(shortId(request.callRequestId));
  const presentation = $derived(requestPresentation(request));
  const verdict = $derived(callVerdictPresentation(request));
  const cancellable = $derived(
    canCancel && ['thinking', 'needs_answers', 'queued'].includes(request.status),
  );
  const retryable = $derived(
    request.status === 'not_placed'
      && request.retryNow === true
      && request.next.some((hint) => hint.tool === 'retry_call_request'),
  );
  let cancelConfirmationOpen = $state(false);
  let cancellationPending = $state(false);
  let placementPending = $state(false);
  let retryPending = $state(false);
  let retryError = $state('');
  let reportBackPending = $state(false);
  let cancellationScope = $state('');
  let cancelConfirmation = $state<HTMLDivElement>();
  const toneClasses: Record<RequestTone, { chip: string; panel: string; dot: string }> = {
    agent: {
      chip: 'border-agent/25 bg-agent-soft text-agent',
      panel: 'border-agent/25 bg-agent-soft',
      dot: 'bg-agent',
    },
    human: {
      chip: 'border-human/25 bg-human-soft text-human-text',
      panel: 'border-human/25 bg-human-soft',
      dot: 'bg-human',
    },
    time: {
      chip: 'border-time/30 bg-time-soft text-time',
      panel: 'border-time/30 bg-time-soft',
      dot: 'bg-time',
    },
    success: {
      chip: 'border-success/25 bg-success-soft text-success-text',
      panel: 'border-success/25 bg-success-soft',
      dot: 'bg-success',
    },
    warning: {
      chip: 'border-warning/30 bg-warning-soft text-warning-text',
      panel: 'border-warning/30 bg-warning-soft',
      dot: 'bg-warning',
    },
    muted: {
      chip: 'border-line bg-subtle text-muted',
      panel: 'border-line bg-subtle',
      dot: 'bg-faint',
    },
  };
  const tone = $derived(toneClasses[presentation.tone]);

  function when(value: string | undefined): string {
    return value ? formatRequestTime(value) : '';
  }

  $effect(() => {
    const nextScope = `${request.callRequestId}:${request.status}`;
    if (nextScope === cancellationScope) return;
    cancellationScope = nextScope;
    cancelConfirmationOpen = false;
    cancellationPending = false;
    placementPending = false;
    retryPending = false;
    retryError = '';
    reportBackPending = false;
  });

  async function askToCancel(): Promise<void> {
    cancelConfirmationOpen = true;
    await tick();
    cancelConfirmation?.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function keepRequest(): void {
    cancelConfirmationOpen = false;
  }

  async function confirmCancellation(): Promise<void> {
    if (cancellationPending) return;
    cancellationPending = true;
    try {
      await onCancel(request.callRequestId);
    } finally {
      cancellationPending = false;
      cancelConfirmationOpen = false;
    }
  }

  async function placeCall(): Promise<void> {
    if (placementPending) return;
    placementPending = true;
    try {
      await onPlace(request.callRequestId);
    } finally {
      placementPending = false;
    }
  }

  async function requestReportBack(): Promise<void> {
    if (reportBackPending) return;
    reportBackPending = true;
    try {
      await onReportBack(request.callRequestId);
    } finally {
      reportBackPending = false;
    }
  }

  async function retryCall(): Promise<void> {
    if (retryPending) return;
    retryPending = true;
    retryError = '';
    try {
      const result = await onRetry(request.callRequestId);
      if (
        typeof result === 'object'
        && result !== null
        && 'ok' in result
        && result.ok === false
        && 'guide' in result
      ) {
        retryError = (result as { guide: { fix?: string } }).guide.fix ?? 'Try again shortly.';
      }
    } catch {
      retryError = 'Try again shortly.';
    } finally {
      retryPending = false;
    }
  }
</script>

<PbCard
  as="article"
  ariaLabel={`Call request ${short}`}
  dataStatus={request.status}
  class="overflow-hidden p-0 sm:p-0"
>
  <header class="border-b border-line px-5 py-5 sm:px-7 sm:py-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <span
        class={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] uppercase ${tone.chip}`}
      >
        <span
          class={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${request.status === 'calling' ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          aria-hidden="true"
        ></span>
        {presentation.label}
      </span>
      <span class="hidden font-[var(--font-mono)] text-2xs tracking-[var(--tracking-wide)] text-faint uppercase sm:inline">
        {short}
      </span>
    </div>

    <h2 class="mt-5 mb-0 max-w-2xl text-2xl tracking-tight text-ink sm:text-3xl">
      {presentation.title}
    </h2>
    <p class="mt-3 mb-0 max-w-2xl text-base leading-relaxed text-muted">
      {presentation.description}
    </p>
  </header>

  <section class="grid gap-px bg-line sm:grid-cols-[minmax(10rem,0.7fr)_minmax(0,1.3fr)]" aria-label="Call brief">
    <div class="min-w-0 bg-surface-warm px-5 py-4 sm:px-7 sm:py-5">
      <div class="flex min-w-0 items-center gap-3">
        <CalleeAvatar />
        <div class="min-w-0">
          <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-faint uppercase">
            Calling
          </p>
          <p class="mt-1 mb-0 break-words font-semibold text-ink">{request.calleeAlias}</p>
        </div>
      </div>
    </div>
    <div class="min-w-0 bg-surface-warm px-5 py-4 sm:px-7 sm:py-5">
      <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-faint uppercase">
        Goal
      </p>
      <p class="mt-2 mb-0 break-words leading-relaxed text-ink">{request.request}</p>
    </div>
  </section>

  <div class="px-5 py-5 sm:px-7 sm:py-6">
    {#if request.status === 'thinking'}
      <div class={`flex min-h-20 items-center gap-4 rounded-sm border px-4 py-4 ${tone.panel}`} role="status" aria-live="polite">
        <span class="size-6 shrink-0 animate-spin rounded-full border-2 border-agent/25 border-t-agent motion-reduce:animate-none" aria-hidden="true"></span>
        <div>
          <p class="m-0 font-semibold text-ink">Preparing the call brief</p>
          <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">Questions or timing will appear here if they are needed.</p>
        </div>
      </div>
    {:else if request.status === 'needs_answers' && request.questions}
      <section aria-labelledby={`questions-${short}`}>
        <h3 id={`questions-${short}`} class="mb-4 text-lg text-ink">Before JooVoice calls</h3>
        <QuestionsForm {request} onSubmit={onAnswer} />
      </section>
    {:else if request.status === 'needs_answers'}
      <div class={`min-h-20 rounded-sm border px-4 py-4 ${tone.panel}`} role="status" aria-live="polite">
        <p class="m-0 font-semibold text-ink">Loading the open questions…</p>
        <p class="mt-1 mb-0 text-sm text-muted">They will appear here as soon as the request refreshes.</p>
      </div>
    {:else if (request.status === 'ready_for_review' || request.status === 'queued') && request.callNow}
      <div class={`flex min-h-24 flex-wrap items-center justify-between gap-4 rounded-sm border px-4 py-4 sm:px-5 ${tone.panel}`}>
        <div class="max-w-lg">
          <p class="m-0 font-semibold text-ink">You control when this call begins.</p>
          <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">Nothing will be dialed until you place it.</p>
        </div>
        <HumanButton
          label={placementPending ? 'Placing…' : 'Place this call'}
          disabled={placementPending}
          onclick={placeCall}
        />
      </div>
    {:else if request.status === 'queued'}
      <div class={`min-h-24 rounded-sm border px-4 py-4 sm:px-5 ${tone.panel}`} role="status" aria-live="polite">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="m-0 font-semibold text-ink">No action needed.</p>
            <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">This page will update when the call starts.</p>
          </div>
          {#if request.window?.notBefore || request.window?.notAfter}
            <dl class="m-0 grid gap-2 text-sm sm:text-right">
              {#if request.window.notBefore}
                <div>
                  <dt class="inline text-faint">From </dt>
                  <dd class="m-0 inline font-semibold text-ink">{when(request.window.notBefore)}</dd>
                </div>
              {/if}
              {#if request.window.notAfter}
                <div>
                  <dt class="inline text-faint">By </dt>
                  <dd class="m-0 inline font-semibold text-ink">{when(request.window.notAfter)}</dd>
                </div>
              {/if}
            </dl>
          {/if}
        </div>
      </div>
    {:else if request.status === 'calling'}
      <div class={`min-h-24 rounded-sm border px-4 py-4 sm:px-5 ${tone.panel}`} role="status" aria-live="polite">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-time uppercase">
              {request.live?.phase.replace('_', ' ') || 'connected'}
            </p>
            <p class="mt-2 mb-0 font-semibold text-ink">You can leave this page.</p>
            <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">The result will be waiting here when the call ends.</p>
          </div>
          {#if request.live}
            <time class="font-[var(--font-mono)] text-2xl font-semibold tracking-tight text-ink">
              {formatElapsed(request.live.seconds)}
            </time>
          {/if}
        </div>
      </div>
    {:else if request.status === 'done'}
      <div class={`flex min-h-24 flex-wrap items-center justify-between gap-4 rounded-sm border px-4 py-4 sm:px-5 ${tone.panel}`}>
        <div class="max-w-lg">
          <p class="m-0 font-semibold text-ink">{verdict?.label ?? 'The call is complete.'}</p>
          <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">
            {verdict?.detail ?? 'Review the outcome and available call details.'}
          </p>
        </div>
        <PbButton size="md" onclick={() => onViewResult(request.callRequestId)}>View result</PbButton>
      </div>
    {:else if retryable}
      <div class={`min-h-24 rounded-sm border px-4 py-4 sm:px-5 ${tone.panel}`} role="status" aria-live="polite">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="max-w-lg">
            <p class="m-0 font-semibold text-ink">No one picked up.</p>
            <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">
              The call never connected, so you can try the same call again.
            </p>
          </div>
          <HumanButton
            label={retryPending ? 'Retrying…' : 'Retry call'}
            disabled={retryPending}
            onclick={retryCall}
          />
        </div>
        {#if retryError}
          <p class="mt-3 mb-0 border-t border-warning/25 pt-3 text-sm font-medium text-warning-text" role="alert">
            {retryError}
          </p>
        {/if}
      </div>
    {:else}
      <div class={`min-h-20 rounded-sm border px-4 py-4 ${tone.panel}`} role="status">
        <p class="m-0 font-semibold text-ink">No action needed.</p>
        {#if request.reason?.retryAfterText}
          <p class="mt-1 mb-0 text-sm text-muted">{request.reason.retryAfterText}</p>
        {/if}
      </div>
    {/if}

    {#if request.reportBack && request.reportBack.status !== 'none'}
      <div class="mt-4 rounded-sm border border-agent/25 bg-agent-soft px-4 py-3 text-sm" role="status">
        <span class="font-semibold text-ink">Result call:</span>
        <span class="text-muted">
          {request.reportBack.status === 'waiting'
            ? 'waiting for this call to finish'
            : request.reportBack.status === 'queued'
              ? 'queued'
              : request.reportBack.status === 'calling'
                ? 'calling you now'
                : 'complete'}
        </span>
      </div>
    {/if}
  </div>

  <footer class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 sm:px-7">
    <div class="flex flex-wrap items-center gap-2">
      {#if cancellable}
        {#if cancelConfirmationOpen}
          <div
            bind:this={cancelConfirmation}
            class="flex min-w-0 flex-wrap items-center gap-2"
            role="group"
            aria-label="Confirm cancellation"
          >
            <span class="mr-1 text-sm font-semibold text-ink">Cancel this request?</span>
            <PbButton variant="ghost" size="md" disabled={cancellationPending} onclick={keepRequest}>
              Keep request
            </PbButton>
            <PbButton variant="danger" size="md" disabled={cancellationPending} onclick={() => void confirmCancellation()}>
              {cancellationPending ? 'Cancelling…' : 'Yes, cancel'}
            </PbButton>
          </div>
        {:else}
          <PbButton variant="ghost" size="md" onclick={() => void askToCancel()}>Cancel</PbButton>
        {/if}
      {/if}
      {#if request.status === 'done' && request.reportBack?.available}
        <PbButton variant="secondary" size="md" disabled={reportBackPending} onclick={() => void requestReportBack()}>
          {reportBackPending ? 'Requesting…' : 'Call me with the result'}
        </PbButton>
      {/if}
    </div>
    <small class="font-[var(--font-mono)] text-2xs tracking-[var(--tracking-wide)] text-faint uppercase">
      {#if request.attemptSummary?.count}
        Attempt {request.attemptSummary.count}<span aria-hidden="true"> · </span>
      {/if}
      Updated {when(request.updatedAt)}
    </small>
  </footer>
</PbCard>

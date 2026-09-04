<script lang="ts">
  import type { ListedTool } from '@joovoice/state-as-tools';
  import { PbButton, PbCard } from '@phonebooth/design';
  import AccountStrip from '$lib/components/AccountStrip.svelte';
  import AgentSeesPanel from '$lib/components/AgentSeesPanel.svelte';
  import FeaturedActionsCanvas from '$lib/components/FeaturedActionsCanvas.svelte';
  import CallList from '$lib/components/CallList.svelte';
  import NewRequestForm from '$lib/components/NewRequestForm.svelte';
  import RequestCard from '$lib/components/RequestCard.svelte';
  import type { BoothPhase } from '$lib/booth.ts';
  import { groupRequests } from '$lib/calls-workspace.ts';
  import type { ServiceMode } from '$lib/settings-storage.ts';
  import type {
    AccountObject,
    Answer,
    CreateCallRequestInput,
    ErrorGuide,
    FeaturedActionsState,
    StatusObject,
  } from '$lib/types.ts';
  import { uxConfig } from '$lib/ux-config.ts';

  let {
    account,
    featuredActions,
    phase,
    mode,
    serviceError,
    guide,
    requests,
    focusedRequest,
    tools,
    webmcpAvailable,
    declarativeForms,
    streamDown,
    canCancelRequests = false,
    initialManualOpen = false,
    onCreate,
    onAnswer,
    onCancel,
    onPlace,
    onRetry,
    onReportBack,
    onViewResult,
    onReturnToCalls,
    hrefForRequest,
    onSignIn,
    onTriggerFeaturedAction,
  }: {
    account: AccountObject;
    featuredActions: FeaturedActionsState | null;
    phase: BoothPhase;
    mode: ServiceMode;
    serviceError: string | null;
    guide: ErrorGuide | null;
    requests: StatusObject[];
    focusedRequest?: StatusObject;
    tools: ListedTool[];
    webmcpAvailable: boolean;
    declarativeForms: boolean;
    streamDown: boolean;
    canCancelRequests?: boolean;
    initialManualOpen?: boolean;
    onCreate: (input: CreateCallRequestInput) => Promise<{ ok: true; value: StatusObject } | { ok: false; guide: ErrorGuide } | null>;
    onAnswer: (id: string, questionSetId: string, answers: Answer[], additionalDetails?: string) => void | Promise<unknown>;
    onCancel: (id: string) => void | Promise<unknown>;
    onPlace: (id: string) => void | Promise<unknown>;
    onRetry: (id: string) => void | Promise<unknown>;
    onReportBack: (id: string) => void | Promise<unknown>;
    onViewResult: (id: string) => void;
    onReturnToCalls: () => void;
    hrefForRequest: (request: StatusObject) => string;
    onSignIn: () => void | Promise<void>;
    onTriggerFeaturedAction: (id: string, values: Record<string, string>, expectedRevision: number) => Promise<{ ok: true; value: FeaturedActionsState } | { ok: false; guide: ErrorGuide } | null | undefined>;
  } = $props();

  let manualOpen = $state(false);
  let lastManualSignal = $state(false);
  let showStreamRecovery = $state(false);
  const requestGroups = $derived(groupRequests(requests));
  const accountNeedsAttention = $derived(phase !== 'ready' || account.accountState !== 'active');

  $effect(() => {
    if (initialManualOpen === lastManualSignal) return;
    manualOpen = initialManualOpen;
    lastManualSignal = initialManualOpen;
  });

  $effect(() => {
    showStreamRecovery = false;
    if (!streamDown) return;
    const timer = setTimeout(() => {
      showStreamRecovery = true;
    }, uxConfig.streamRecoveryNoticeDelaySeconds * 1000);
    return () => clearTimeout(timer);
  });

  async function createAndClose(input: CreateCallRequestInput) {
    const outcome = await onCreate(input);
    if (outcome?.ok) manualOpen = false;
    return outcome;
  }

  function returnToCalls(): void {
    manualOpen = false;
    onReturnToCalls();
  }
</script>

<div class="mx-auto w-full max-w-6xl">
  <header class="mb-7 flex flex-wrap items-start justify-between gap-5">
    <div>
      <h1 class="m-0 text-3xl tracking-tight text-ink sm:text-4xl">Calls</h1>
      <p class="mt-3 mb-0 max-w-2xl text-base leading-relaxed text-muted">
        Make a call here, or let your agent send one. Both follow the same JooVoice call flow.
      </p>
    </div>

    {#if requests.length > 0 || manualOpen}
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="inline-flex min-h-10 items-center gap-2 rounded-full border border-success/25 bg-success-soft px-4 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wide)] text-success-text uppercase"
          role="status"
        >
          <span class={`h-2 w-2 rounded-full ${webmcpAvailable ? 'bg-success' : 'bg-faint'}`} aria-hidden="true"></span>
          Agent {webmcpAvailable ? 'connected' : 'not connected'}
        </span>
        {#if account.accountState === 'active' && !manualOpen}
          <PbButton
            size="md"
            onclick={() => (manualOpen = true)}
          >
            Make a call
          </PbButton>
        {/if}
      </div>
    {/if}
  </header>

  {#if showStreamRecovery}
    <aside
      class="mb-5 flex min-h-14 items-center gap-3 rounded-sm border border-time/30 bg-time-soft px-4 py-3 text-sm"
      aria-live="polite"
      aria-label="Live update recovery"
    >
      <span class="size-5 shrink-0 animate-spin rounded-full border-2 border-time/25 border-t-time motion-reduce:animate-none" aria-hidden="true"></span>
      <p class="m-0 leading-relaxed text-muted">
        <strong class="text-ink">Restoring live updates.</strong>
        Calls are still checked automatically.
      </p>
    </aside>
  {/if}

  {#if accountNeedsAttention}
    <div class="mb-5">
      <AccountStrip account={account} {phase} {mode} error={serviceError} {onSignIn} />
    </div>
  {/if}

  {#if guide}
    <aside class="mb-5 rounded-sm border border-warning/30 bg-warning-soft px-5 py-4" aria-label="Request needs attention" role="alert">
      <p class="m-0 font-semibold text-ink">{guide.headline}</p>
      <p class="mt-1 mb-0 text-sm leading-relaxed text-muted">{guide.fix}</p>
    </aside>
  {/if}

  {#if featuredActions}
    <div class="mb-6">
      <FeaturedActionsCanvas presentation={featuredActions} onTrigger={onTriggerFeaturedAction} />
    </div>
  {/if}

  <div class="flex min-w-0 flex-col gap-6">
    {#if manualOpen}
      <div>
        <button
          type="button"
          class="mb-5 inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-sm font-semibold text-muted hover:text-ink"
          onclick={returnToCalls}
        >
          <span class="mr-2" aria-hidden="true">←</span>
          All calls
        </button>
        <NewRequestForm onSubmit={createAndClose} />
      </div>
    {:else if focusedRequest}
      <div>
        <button
          type="button"
          class="mb-5 inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-sm font-semibold text-muted hover:text-ink"
          onclick={returnToCalls}
        >
          <span class="mr-2" aria-hidden="true">←</span>
          All calls
        </button>
        <RequestCard
          request={focusedRequest}
          canCancel={canCancelRequests}
          {onAnswer}
          {onCancel}
          {onPlace}
          {onRetry}
          {onReportBack}
          {onViewResult}
        />
      </div>
    {:else if requests.length === 0}
      <section aria-labelledby="start-call-title">
        <h2 id="start-call-title" class="m-0 text-2xl tracking-tight text-ink sm:text-3xl">Start a call</h2>
        <p class="mt-3 mb-0 max-w-2xl text-base leading-relaxed text-muted">
          Use whichever is easier. You and your agent create the same kind of call request.
        </p>

        <div class="mt-6 grid items-stretch gap-5 md:grid-cols-2">
          <PbCard as="section" ariaLabel="Make a call yourself" class="flex h-full flex-col p-5 sm:p-6">
            <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-human-text uppercase">
              You
            </p>
            <h3 class="mt-5 mb-0 text-xl tracking-tight text-ink">Make a call here</h3>
            <p class="mt-3 mb-0 text-sm leading-relaxed text-muted">
              Enter the number and tell JooVoice what you want accomplished.
            </p>
            {#if account.accountState === 'active'}
              <div class="mt-auto pt-6">
                <PbButton size="md" onclick={() => (manualOpen = true)}>Make a call</PbButton>
              </div>
            {/if}
          </PbCard>

          <AgentSeesPanel available={webmcpAvailable} />
        </div>
      </section>
    {:else}
      {#if requestGroups.active.length > 0}
        <section aria-labelledby="active-calls-title">
          <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
                Happening now
              </p>
              <h2 id="active-calls-title" class="mt-1 mb-0 text-xl tracking-tight text-ink sm:text-2xl">Active calls</h2>
            </div>
            <span class="font-[var(--font-mono)] text-2xs tracking-[var(--tracking-wide)] text-faint uppercase">
              {requestGroups.active.length} {requestGroups.active.length === 1 ? 'call' : 'calls'}
            </span>
          </div>
          <CallList
            requests={requestGroups.active}
            ariaLabel="Active calls"
            {hrefForRequest}
          />
        </section>
      {/if}

      {#if requestGroups.recent.length > 0}
        <section aria-labelledby="recent-calls-title" class={requestGroups.active.length > 0 ? 'mt-2' : ''}>
          <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-faint uppercase">
                History
              </p>
              <h2 id="recent-calls-title" class="mt-1 mb-0 text-xl tracking-tight text-ink sm:text-2xl">Recent calls</h2>
            </div>
            <span class="font-[var(--font-mono)] text-2xs tracking-[var(--tracking-wide)] text-faint uppercase">
              {requestGroups.recent.length} {requestGroups.recent.length === 1 ? 'call' : 'calls'}
            </span>
          </div>
          <CallList
            requests={requestGroups.recent}
            ariaLabel="Recent calls"
            {hrefForRequest}
          />
        </section>
      {/if}
    {/if}
  </div>
</div>

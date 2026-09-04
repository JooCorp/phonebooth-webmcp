<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { PbButton, PbCard } from '@phonebooth/design';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import CallResultCanvas from '$lib/components/CallResultCanvas.svelte';
  import CallsWorkspace from '$lib/components/CallsWorkspace.svelte';
  import FirstVisit from '$lib/components/FirstVisit.svelte';
  import WelcomeCall from '$lib/components/WelcomeCall.svelte';
  import { selectFocusedRequest } from '$lib/calls-workspace.ts';
  import { resolveRootScreen } from '$lib/root-screen.ts';
  import {
    app,
    current,
    ensureConnected,
    redeemSignIn,
    reopenSignIn,
    resumeSignIn,
    signInState,
    startSignIn,
  } from '$lib/store.svelte.ts';
  import type { Answer, CreateCallRequestInput, StatusObject } from '$lib/types.ts';

  onMount(() => {
    void initialize();
  });

  async function initialize() {
    try {
      if (!(await resumeSignIn())) await ensureConnected();
    } catch {
      // The sign-in store owns the visible recovery state.
    }
  }

  const selectedCallId = $derived(page.url.searchParams.get('call'));
  const selectedResultId = $derived(page.url.searchParams.get('result'));
  const openManualForm = $derived(page.url.searchParams.get('new-call') === '1');
  const focusedRequest = $derived(selectFocusedRequest(app.requests, selectedCallId));
  const resultRequest = $derived(
    selectedResultId
      ? app.requests.find((request) => request.callRequestId === selectedResultId)
      : undefined,
  );
  let welcomeDismissedForSession = $state(false);
  const activeAccount = $derived(app.phase === 'unauthorized' ? null : app.account);
  const rootScreen = $derived(resolveRootScreen(activeAccount, welcomeDismissedForSession));
  const welcomeCallAvailable = $derived(Boolean(activeAccount?.welcomeCall));
  const canRequestWelcomeCall = $derived(
    welcomeCallAvailable
      && (app.mode === 'hosted' || app.catalog.some((tool) => tool.name === 'request_welcome_call')),
  );
  const canCancelRequests = $derived(app.catalog.some((tool) => tool.name === 'cancel_call_request'));
  const documentTitle = $derived(
    rootScreen === 'first_visit'
      ? 'Phonebooth by JooVoice'
      : rootScreen === 'welcome_call'
        ? 'Your first call · Phonebooth'
        : `${resultRequest?.result?.presentation?.headline?.trim() || (selectedResultId ? 'Call result' : 'Calls')} · Phonebooth`,
  );

  async function create(input: CreateCallRequestInput) {
    const outcome = await (current()?.createCallRequest(input) ?? Promise.resolve(null));
    if (outcome?.ok) {
      await goto(`/?call=${encodeURIComponent(outcome.value.callRequestId)}`, {
        replaceState: true,
        noScroll: true,
      });
    }
    return outcome;
  }

  const answer = (id: string, questionSetId: string, answers: Answer[], additionalDetails?: string) =>
    current()?.answerQuestions(id, questionSetId, answers, additionalDetails);
  const cancel = (id: string) => current()?.cancel(id);
  const place = (id: string) => current()?.placeCall(id);
  const retry = (id: string) => current()?.retryCall(id);
  const reportBack = (id: string) => current()?.requestReportBack(id);
  const triggerFeaturedAction = async (id: string, values: Record<string, string>, expectedRevision: number) =>
    current()?.triggerFeaturedAction(id, values, expectedRevision) ?? null;

  function signIn() {
    void startSignIn().catch(() => {
      // The sign-in store owns the visible recovery state.
    });
  }

  async function requestWelcomeCall(phone: string) {
    const outcome = await current()?.requestWelcomeCall(phone);
    if (!outcome) throw new Error('The calling service is not connected yet. Try again shortly.');
    if (!outcome.ok) throw new Error(outcome.guide.fix);
    if (!outcome.value.welcomeCall) welcomeDismissedForSession = true;
  }

  function dismissWelcomeCall() {
    welcomeDismissedForSession = true;
  }

  $effect(() => {
    if (app.phase === 'unauthorized' || !app.account?.loggedIn) welcomeDismissedForSession = false;
  });

  function viewResult(id: string) {
    void goto(`/?result=${encodeURIComponent(id)}`);
  }

  function allCalls() {
    void goto('/');
  }

  function makeNewCall() {
    void goto('/?new-call=1');
  }

  function hrefForRequest(request: StatusObject): string {
    const id = encodeURIComponent(request.callRequestId);
    return request.status === 'done' && request.result ? `/?result=${id}` : `/?call=${id}`;
  }
</script>

<svelte:head>
  <title>{documentTitle}</title>
  <meta name="description" content="Create, follow, and review calls handled by JooVoice." />
</svelte:head>

{#if rootScreen === 'welcome_call' && app.account}
  <WelcomeCall
    welcomeCall={app.account.welcomeCall ?? { status: 'required', phoneAlias: null, acknowledged: false }}
    canRequest={canRequestWelcomeCall}
    onRequest={requestWelcomeCall}
    onDismiss={dismissWelcomeCall}
  />
{:else if rootScreen === 'workspace' && app.account}
  <div class="relative grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app">
    <div
      class="pointer-events-none absolute -top-40 -right-44 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,var(--theme-agent-soft),transparent_68%)] opacity-70"
      aria-hidden="true"
    ></div>
    <div
      class="pointer-events-none absolute -bottom-52 -left-48 h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(circle,var(--theme-human-soft),transparent_68%)] opacity-55"
      aria-hidden="true"
    ></div>

    <AppHeader />

    <main class="relative z-0 min-h-0 overflow-y-auto overscroll-contain px-5 py-7 sm:px-8 sm:py-10">
      {#if selectedResultId}
        <div class="mx-auto w-full max-w-5xl">
          <button
            type="button"
            class="mb-7 inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-sm font-semibold text-muted hover:text-ink"
            onclick={allCalls}
          >
            <span class="mr-2" aria-hidden="true">←</span>
            All calls
          </button>

          {#if resultRequest?.result}
            <CallResultCanvas status={resultRequest} onCreateNewCall={makeNewCall} />
          {:else if app.phase === 'connecting' || app.phase === 'idle'}
            <PbCard as="section" ariaLabel="Loading call result" class="flex min-h-48 items-center gap-4">
              <span class="size-6 shrink-0 animate-spin rounded-full border-2 border-agent/25 border-t-agent motion-reduce:animate-none" aria-hidden="true"></span>
              <div>
                <h1 class="m-0 text-2xl text-ink">Loading the call result…</h1>
                <p class="mt-2 mb-0 text-sm text-muted">Phonebooth is reconnecting to JooVoice.</p>
              </div>
            </PbCard>
          {:else}
            <PbCard as="section" ariaLabel="Call result unavailable" class="flex min-h-48 flex-col items-start justify-center gap-3">
              <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-warning-text uppercase">Result unavailable</p>
              <h1 class="m-0 text-2xl text-ink">This result is not ready.</h1>
              <p class="m-0 max-w-xl text-sm leading-relaxed text-muted">
                The request may still be active, or it may no longer be included in the service response.
              </p>
              <PbButton size="md" variant="ghost" onclick={allCalls}>Back to calls</PbButton>
            </PbCard>
          {/if}
        </div>
      {:else}
        <CallsWorkspace
          account={app.account}
          featuredActions={app.featuredActions}
          phase={app.phase}
          mode={app.mode}
          serviceError={app.error}
          guide={app.lastGuide}
          requests={app.requests}
          {focusedRequest}
          tools={app.agentSees}
          webmcpAvailable={app.webmcp.available}
          declarativeForms={app.webmcp.declarativeForms}
          streamDown={app.streamDown}
          {canCancelRequests}
          initialManualOpen={openManualForm}
          onCreate={create}
          onAnswer={answer}
          onCancel={cancel}
          onPlace={place}
          onRetry={retry}
          onReportBack={reportBack}
          onViewResult={viewResult}
          onReturnToCalls={allCalls}
          {hrefForRequest}
          onSignIn={startSignIn}
          onTriggerFeaturedAction={triggerFeaturedAction}
        />
      {/if}
    </main>
  </div>
{:else}
  <FirstVisit signIn={signInState} onSignIn={signIn} onReopen={reopenSignIn} onRedeem={redeemSignIn} />
{/if}

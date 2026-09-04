<script lang="ts">
  import { goto } from '$app/navigation';
  import CallLive, { type CallLiveState } from '$lib/components/CallLive.svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';

  const call: CallLiveState = {
    calleeLabel: 'Basilico Restaurant',
    objective: 'Reserve a table for two on Saturday, 5 September at 7:30 pm.',
    elapsedSeconds: 42,
  };

  function returnToCalls() {
    void goto('/');
  }
</script>

<svelte:head>
  <title>Call in progress · Phonebooth</title>
  <meta
    name="description"
    content="A Phonebooth call is in progress. The result will be saved when it ends."
  />
</svelte:head>

<div class="relative grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app">
  <div
    class="pointer-events-none absolute -top-36 -right-40 h-96 w-96 rounded-full bg-[radial-gradient(circle,var(--theme-agent-soft),transparent_68%)] opacity-80"
    aria-hidden="true"
  ></div>
  <div
    class="pointer-events-none absolute -bottom-44 -left-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,var(--theme-time-soft),transparent_68%)] opacity-65"
    aria-hidden="true"
  ></div>

  <AppHeader />

  <main class="relative z-10 min-h-0 overflow-y-auto overscroll-contain px-5 py-8 sm:px-8 sm:py-12">
    <div class="mx-auto flex min-h-full w-full max-w-5xl items-center py-4">
      <CallLive {call} onBack={returnToCalls} />
    </div>
  </main>
</div>

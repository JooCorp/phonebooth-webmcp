<script lang="ts">
  import { goto } from '$app/navigation';
  import { PbButton, PbCard, PbField, PbWordmark } from '@phonebooth/design';
  import { modeLabels, personalTokenPattern, type ServiceMode } from '$lib/settings-storage.ts';
  import {
    developerControlsEnabled,
    hostedMcpUrl,
    savePersonalToken,
    saveSettings,
    settings,
  } from '$lib/settings.svelte.ts';
  import { connect, signOut } from '$lib/store.svelte.ts';

  let mode = $state<ServiceMode>(settings.mode);
  let selfHostedUrl = $state(settings.selfHostedUrl);
  let personalToken = $state(settings.personalToken);
  let tokenProblem = $state(false);

  const modes: ServiceMode[] = ['simulation', 'hosted', 'self_hosted'];

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!developerControlsEnabled) return;
    tokenProblem = personalToken.trim() !== '' && !personalTokenPattern.test(personalToken.trim());
    if (tokenProblem) return;
    saveSettings({ mode, selfHostedUrl });
    savePersonalToken(personalToken);
    await connect();
    await goto('/');
  }

  function forget() {
    if (!developerControlsEnabled) return;
    signOut();
    savePersonalToken('');
    personalToken = '';
  }
</script>

<svelte:head>
  <title>Service controls preview · Phonebooth</title>
</svelte:head>

<div class="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app">
  <header class="border-b border-line-subtle bg-app/90">
    <div class="mx-auto flex min-h-16 w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-2 sm:px-8">
      <div aria-label="Phonebooth"><PbWordmark compact /></div>
      <a class="inline-flex min-h-11 items-center text-sm font-semibold text-link no-underline hover:text-link-hover" href="/">
        Return to Calls
      </a>
    </div>
  </header>

  <main class="min-h-0 overflow-y-auto overscroll-contain px-5 py-7 sm:px-8 sm:py-10">
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
          Developer preview
        </p>
        <h1 class="mt-2 mb-0 text-3xl tracking-tight text-ink">Service controls</h1>
        <p class="mt-3 mb-0 max-w-2xl text-sm leading-relaxed text-muted">
          Local testing controls for simulation, hosted, and self-hosted MCP connections. This is not part of the user product.
        </p>
      </header>

      {#if developerControlsEnabled}
        <PbCard as="section" ariaLabel="Developer service controls">
          <form onsubmit={save} class="flex flex-col gap-4">
            <fieldset class="m-0 rounded-xs border border-line-strong p-4">
              <legend class="px-1 text-sm font-semibold">Service</legend>
              {#each modes as option (option)}
                <PbField variant="choice" label={modeLabels[option]}>
                  <input type="radio" name="mode" value={option} bind:group={mode} />
                </PbField>
              {/each}
            </fieldset>

            {#if mode === 'hosted'}
              <p class="m-0 text-sm text-muted">Service: <code>{hostedMcpUrl}</code></p>
            {:else if mode === 'self_hosted'}
              <PbField label="Base URL">
                <input type="url" name="selfHostedUrl" bind:value={selfHostedUrl} placeholder="http://localhost:4323" required />
              </PbField>
              <PbField label="Personal access token">
                <input type="password" name="personalToken" bind:value={personalToken} placeholder="pat_…" autocomplete="off" />
              </PbField>
              {#if tokenProblem}
                <p class="m-0 text-sm text-error" role="alert">The token does not look like a personal access token.</p>
              {/if}
            {:else}
              <p class="m-0 text-sm text-muted">The simulation runs inside this page. No service is contacted.</p>
            {/if}

            <div class="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <PbButton type="submit" size="md">Apply and return</PbButton>
              <PbButton variant="ghost" size="md" onclick={forget}>Forget test token</PbButton>
            </div>
          </form>
        </PbCard>
      {:else}
        <PbCard as="section" ariaLabel="Developer controls unavailable" class="flex min-h-40 flex-col justify-center gap-2">
          <h2 class="m-0 text-xl text-ink">Developer controls are disabled.</h2>
          <p class="m-0 text-sm text-muted">Run the local development server to use this testing surface.</p>
        </PbCard>
      {/if}
    </div>
  </main>
</div>

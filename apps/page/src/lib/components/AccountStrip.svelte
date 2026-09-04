<script lang="ts">
  import { PbButton, PbCard } from '@phonebooth/design';
  import type { BoothPhase } from '$lib/booth.ts';
  import type { ServiceMode } from '$lib/settings-storage.ts';
  import type { AccountObject } from '$lib/types.ts';

  let {
    account,
    phase,
    mode,
    error,
    onSignIn,
  }: {
    account: AccountObject | null;
    phase: BoothPhase;
    mode: ServiceMode;
    error: string | null;
    onSignIn: () => void | Promise<void>;
  } = $props();
</script>

<PbCard as="section" ariaLabel="Account status" class="flex flex-wrap items-center justify-between gap-4">
  {#if phase === 'connecting' || phase === 'idle'}
    <div>
      <p class="m-0 font-semibold text-ink">Connecting to JooVoice…</p>
      <p class="mt-1 mb-0 text-sm text-muted">Call state will appear when the connection is ready.</p>
    </div>
  {:else if phase === 'unauthorized'}
    <div>
      <p class="m-0 font-semibold text-ink">Sign in again to keep calling.</p>
      <p class="mt-1 mb-0 text-sm text-muted">Your place on this page will be preserved.</p>
    </div>
    {#if mode === 'hosted'}
      <PbButton size="md" onclick={() => void onSignIn()}>Sign in</PbButton>
    {:else}
      <a class="font-semibold text-link" href="/preview/service-settings">Open developer controls</a>
    {/if}
  {:else if phase === 'error'}
    <div>
      <p class="m-0 font-semibold text-ink">JooVoice did not answer.</p>
      <p class="mt-1 mb-0 text-sm text-muted">{error || 'Check the service connection and try again.'}</p>
    </div>
  {:else if account && account.accountState !== 'active'}
    <div class="min-w-0">
      <p class="m-0 font-semibold text-ink">Your JooVoice account needs attention.</p>
      {#if account.blockers.length > 0}
        <ul class="mt-2 mb-0 flex flex-col gap-1 pl-5 text-sm text-muted">
          {#each account.blockers as blocker (blocker.code)}
            <li><a class="text-link" href={blocker.url}>{blocker.text}</a></li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else if account}
    <div>
      <p class="m-0 font-semibold text-ink">JooVoice is ready.</p>
      <p class="mt-1 mb-0 text-sm text-muted">{account.displayName || 'Signed in'}</p>
    </div>
  {/if}
</PbCard>

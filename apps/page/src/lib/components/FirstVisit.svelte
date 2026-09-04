<script lang="ts">
  import { PbButton, PbWordmark } from '@phonebooth/design';
  import type { SignInState } from '$lib/store.svelte.ts';
  import { uxConfig } from '$lib/ux-config.ts';
  import PhoneboothArtwork from './PhoneboothArtwork.svelte';

  let {
    signIn,
    onSignIn,
    onReopen,
    onRedeem,
  }: {
    signIn: SignInState;
    onSignIn: () => void | Promise<void>;
    onReopen: () => void;
    onRedeem: (fallbackAuthString: string) => void | Promise<void>;
  } = $props();

  const busy = $derived(
    signIn.phase === 'starting'
      || signIn.phase === 'waiting'
      || signIn.phase === 'recovering'
      || signIn.phase === 'approved',
  );
  const hasHandoff = $derived(signIn.phase !== 'idle');
  const buttonLabel = $derived(
    signIn.phase === 'approved'
      ? 'Signing in…'
      : busy
        ? 'Waiting for JooVoice…'
        : signIn.phase === 'error'
          ? signIn.loginUrl
            ? 'Continue login'
            : 'Try Login again'
          : 'Login',
  );
  let showProgress = $state(false);
  let fallbackAuthString = $state('');

  function handoffTitle(phase: SignInState['phase']): string {
    switch (phase) {
      case 'starting': return 'Creating your secure sign-in code…';
      case 'waiting': return 'Finish signing in to JooVoice';
      case 'recovering': return 'Checking your JooVoice auth string…';
      case 'approved': return 'You’re signed in';
      case 'recovery': return 'Finish here with your auth string';
      default: return 'Sign-in paused';
    }
  }

  function handoffCopy(current: SignInState): string {
    switch (current.phase) {
      case 'starting': return 'JooVoice will open in another window.';
      case 'waiting': return 'Phonebooth will continue here automatically.';
      case 'recovering': return 'This should only take a moment.';
      case 'approved': return 'Opening Phonebooth…';
      case 'recovery': return 'Copy it from the JooVoice window and paste it below.';
      default: return current.loginUrl ? 'Your sign-in code is still active.' : 'Start again when you’re ready.';
    }
  }

  function redeem(event: SubmitEvent) {
    event.preventDefault();
    void Promise.resolve(onRedeem(fallbackAuthString)).catch(() => {
      // The sign-in store owns the visible recovery state.
    });
  }

  $effect(() => {
    const active = signIn.phase === 'starting' || signIn.phase === 'waiting' || signIn.phase === 'recovering';
    if (!active) {
      showProgress = false;
      return;
    }
    const delay = uxConfig.inlineLoadingIndicatorDelaySeconds;
    if (delay === 0) {
      showProgress = true;
      return;
    }
    const timer = window.setTimeout(() => {
      showProgress = true;
    }, delay * 1000);
    return () => window.clearTimeout(timer);
  });
</script>

<section class="lander">
  <div class="warm-glow warm-glow--coral" aria-hidden="true"></div>
  <div class="warm-glow warm-glow--lavender" aria-hidden="true"></div>
  <PhoneboothArtwork />

  <main class="lander__scroll">
    <div class="lander__main">
    <div class="lander__badge">
      <picture aria-hidden="true">
        <source srcset="/assets/agent-mark.webp" type="image/webp" />
        <img src="/assets/agent-mark.png" alt="" width="48" height="48" />
      </picture>
      <span>Works with AI agents</span>
    </div>

    <div class="lander__logo">
      <PbWordmark />
    </div>

    <h1 class="lander__headline">
      Your agent can now make <em>calls that get things done.</em>
    </h1>

    <p class="lander__proof">(Hear it for yourself within 30 seconds of signing in.)</p>

    <p class="lander__subhead">
      Reservations, appointments, cancellations, and the calls that still need a real conversation. Handled end-to-end in 40+ languages.
    </p>

    <div class="lander__cta" aria-busy={busy}>
      {#if signIn.phase !== 'recovery'}
        <PbButton disabled={busy} onclick={() => void onSignIn()}>{buttonLabel}</PbButton>
      {/if}
    </div>

    <div class="flex min-h-[clamp(188px,22.5vw,238px)] w-full items-start justify-center max-[720px]:min-h-[clamp(145px,42.5vw,188px)] [@media(max-width:520px)_and_(max-height:680px)]:min-h-[120px]">
      {#if hasHandoff}
        <section
          class="flex w-[min(100%,430px)] flex-col items-center gap-3 rounded-lg border border-line-strong bg-[rgba(255,253,251,0.82)] p-5 text-left shadow-[var(--theme-shadow-md)] max-[720px]:max-w-[390px] max-[720px]:p-4 [@media(max-width:520px)_and_(max-height:680px)]:gap-2 [@media(max-width:520px)_and_(max-height:680px)]:px-4 [@media(max-width:520px)_and_(max-height:680px)]:py-3"
          aria-live="polite"
          aria-label="JooVoice sign-in status"
        >
          <div class="flex w-full items-start gap-3">
            {#if signIn.phase === 'approved'}
              <span class="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-sm font-bold text-success-text" aria-hidden="true">✓</span>
            {:else if showProgress}
              <span class="size-6 shrink-0 animate-spin rounded-full border-2 border-time-soft border-t-time motion-reduce:animate-none" aria-hidden="true"></span>
            {/if}
            <div class="min-w-0">
              <strong class="block font-[var(--font-display)] text-base leading-[var(--leading-snug)] font-bold text-ink">
                {handoffTitle(signIn.phase)}
              </strong>
              <p class="mt-1 mb-0 text-sm leading-[var(--leading-normal)] text-muted [@media(max-width:520px)_and_(max-height:680px)]:text-xs">
                {handoffCopy(signIn)}
              </p>
            </div>
          </div>

          {#if signIn.userCode}
            <div class="flex w-full items-center justify-between gap-4 rounded-sm border border-line bg-time-soft px-4 py-3 [@media(max-width:520px)_and_(max-height:680px)]:py-2">
              <span class="text-xs font-semibold text-muted">Sign-in code</span>
              <strong class="font-[var(--font-mono)] text-lg tracking-[var(--tracking-wide)] text-time">{signIn.userCode}</strong>
            </div>
          {/if}

          {#if signIn.loginUrl && signIn.phase !== 'approved'}
            <button
              class="min-h-11 cursor-pointer rounded-xs border-0 bg-transparent px-3 py-2 text-sm font-semibold text-link underline underline-offset-[3px] hover:bg-human-soft hover:text-link-hover"
              type="button"
              onclick={onReopen}
            >Open JooVoice again ↗</button>
          {/if}

          {#if signIn.phase === 'recovery'}
            <form class="grid w-full gap-2" aria-label="Recover JooVoice sign-in" onsubmit={redeem}>
              <label class="text-xs font-semibold text-muted" for="fallback-auth-string">JooVoice auth string</label>
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 max-[720px]:grid-cols-1 max-[720px]:[&>button]:w-full">
                <input
                  id="fallback-auth-string"
                  class="m-0 min-h-14 min-w-0 rounded-xs border border-line-strong bg-surface px-3 py-2 font-[var(--font-mono)] text-[max(var(--text-base),16px)] hover:border-human-text focus-visible:border-focus"
                  bind:value={fallbackAuthString}
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="Paste auth string"
                />
                <PbButton type="submit">Continue</PbButton>
              </div>
              <button
                class="min-h-11 cursor-pointer justify-self-center rounded-xs border-0 bg-transparent px-3 text-xs text-muted underline underline-offset-[3px] hover:bg-subtle hover:text-ink"
                type="button"
                onclick={() => void onSignIn()}
              >Start over with a new code</button>
            </form>
          {/if}

          {#if signIn.error}
            <p class="m-0 w-full text-center text-sm leading-[var(--leading-normal)] font-medium text-error" role="alert">{signIn.error}</p>
          {/if}
        </section>
      {/if}
    </div>
    </div>
  </main>
</section>

<style>
  .lander {
    position: relative;
    display: flex;
    height: 100vh;
    height: 100svh;
    overflow: hidden;
    flex-direction: column;
    align-items: center;
    background: var(--theme-bg-app);
  }

  .lander__scroll {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-10) var(--space-6);
  }

  .lander__main {
    display: flex;
    width: 100%;
    min-height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .lander__badge {
    display: inline-flex;
    max-width: calc(100% - 16px);
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-8);
    padding: var(--space-2) var(--space-4) var(--space-2) var(--space-3);
    border: 1px solid rgb(232 165 152 / 25%);
    border-radius: var(--radius-full);
    background: rgb(232 165 152 / 12%);
    color: var(--theme-human-text);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    line-height: 1.35;
    letter-spacing: -0.1px;
  }

  .lander__badge picture,
  .lander__badge img {
    display: block;
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
  }

  .lander__logo {
    margin-bottom: var(--space-7);
  }

  .lander__headline {
    max-width: 950px;
    margin: 0 0 var(--space-4);
    color: var(--theme-text);
    font-family: var(--font-display);
    font-size: clamp(var(--text-4xl), 4.1vw, var(--text-display));
    font-weight: var(--weight-regular);
    line-height: 1.1;
    letter-spacing: 0;
    text-wrap: balance;
  }

  .lander__headline em {
    color: var(--theme-human-text);
    font-weight: inherit;
  }

  .lander__proof {
    margin: 0 0 var(--space-4);
    color: var(--theme-human-text);
    font-size: var(--text-base);
    font-weight: var(--weight-semibold);
    line-height: 1.4;
    text-wrap: balance;
  }

  .lander__subhead {
    max-width: 670px;
    margin: 0 0 var(--space-7);
    color: var(--theme-text-muted);
    font-size: var(--text-lead);
    font-weight: var(--weight-medium);
    line-height: 1.48;
    text-wrap: pretty;
  }

  .lander__cta {
    display: flex;
    min-height: var(--size-control-xl);
    align-items: center;
    flex-direction: column;
    margin-bottom: var(--space-8);
  }

  .warm-glow {
    position: absolute;
    z-index: 0;
    border-radius: var(--radius-full);
    filter: blur(55px);
    pointer-events: none;
  }

  .warm-glow--coral {
    top: -10%;
    right: -5%;
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, var(--palette-coral-400) 0%, transparent 65%);
    opacity: 0.35;
  }

  .warm-glow--lavender {
    bottom: -15%;
    left: -8%;
    width: 580px;
    height: 580px;
    background: radial-gradient(circle, var(--palette-lavender-400) 0%, transparent 65%);
    opacity: 0.22;
  }

  @media (max-width: 720px) {
    .lander__scroll {
      padding: var(--space-7) var(--space-5) var(--space-6);
    }

    .lander__badge {
      margin-bottom: var(--space-6);
    }

    .lander__logo {
      margin-bottom: var(--space-5);
    }

    .lander__headline {
      max-width: 390px;
      margin-bottom: var(--space-3);
      font-size: clamp(var(--text-3xl), 10.4vw, var(--text-wordmark));
      line-height: 1.1;
    }

    .lander__proof {
      max-width: 340px;
      margin-bottom: var(--space-4);
      font-size: var(--text-base);
    }

    .lander__subhead {
      max-width: 350px;
      margin-bottom: var(--space-6);
      font-size: var(--text-base);
      line-height: 1.44;
    }

    .lander__cta {
      margin-bottom: var(--space-6);
    }
  }

  @media (max-width: 380px) {
    .lander__scroll {
      padding-inline: var(--space-4);
    }

    .lander__headline {
      font-size: var(--text-3xl);
    }

    .lander__proof {
      font-size: var(--text-md);
    }

    .lander__subhead {
      font-size: var(--text-base);
    }
  }

  @media (max-width: 520px) and (max-height: 680px) {
    .lander__scroll {
      padding-block: var(--space-4);
    }

    .lander__badge {
      margin-bottom: var(--space-3);
    }

    .lander__logo {
      margin-bottom: var(--space-3);
    }

    .lander__headline {
      margin-bottom: var(--space-3);
      font-size: var(--text-display-sm);
    }

    .lander__proof {
      margin-bottom: var(--space-2);
      font-size: var(--text-sm);
    }

    .lander__subhead {
      margin-bottom: var(--space-4);
      font-size: var(--text-md);
      line-height: 1.38;
    }

    .lander__cta {
      margin-bottom: var(--space-4);
    }
  }
</style>

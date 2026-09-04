<script lang="ts">
  import { PbButton, PbField, PbWordmark } from '@phonebooth/design';
  import type { WelcomeCallState } from '$lib/types.ts';

  let {
    welcomeCall,
    canRequest,
    onRequest,
    onDismiss,
  }: {
    welcomeCall: WelcomeCallState;
    canRequest: boolean;
    onRequest: (phone: string) => void | Promise<void>;
    onDismiss: () => void | Promise<void>;
  } = $props();

  let phone = $state('');
  let requesting = $state(false);
  let leaving = $state<'skip' | 'continue' | null>(null);
  let error = $state('');

  const inFlight = $derived(welcomeCall.status === 'requested' || welcomeCall.status === 'calling');
  const busy = $derived(requesting || leaving !== null);

  function normalizedPhone(value: string): string {
    const trimmed = value.trim();
    return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
  }

  async function requestCall(event: SubmitEvent) {
    event.preventDefault();
    const normalized = normalizedPhone(phone);

    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      error = 'Enter your number with its country code.';
      return;
    }

    requesting = true;
    error = '';
    try {
      await onRequest(normalized);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'We could not start the welcome call. Try again.';
    } finally {
      requesting = false;
    }
  }

  async function leaveWelcomeCall(kind: 'skip' | 'continue') {
    leaving = kind;
    error = '';
    try {
      await onDismiss();
    } catch (cause) {
      error = cause instanceof Error
        ? cause.message
        : kind === 'skip'
          ? 'We could not skip the welcome call. Try again.'
          : 'We could not continue to Phonebooth. Try again.';
    } finally {
      leaving = null;
    }
  }
</script>

<section class="welcome-call">
  <div class="welcome-call__glow welcome-call__glow--coral" aria-hidden="true"></div>
  <div class="welcome-call__glow welcome-call__glow--lavender" aria-hidden="true"></div>

  <header class="welcome-call__header">
    <PbWordmark compact />
  </header>

  <main class="welcome-call__scroll">
    <div class="welcome-call__main">
      <div class="welcome-call__copy">
        <p class="welcome-call__eyebrow">Your first call</p>
        <h1>{canRequest ? 'Hear JooVoice for yourself.' : 'Welcome to Phonebooth.'}</h1>
        {#if canRequest}
          <p class="welcome-call__intro">
            Enter your phone number and Bowlboy will give you a short welcome call.
            We usually use this first call so people can confirm that the number belongs to them.
          </p>
        {:else}
          <p class="welcome-call__intro">
            Bowlboy is ready to handle calls for you. Head into Phonebooth to see your call list.
          </p>
        {/if}
        <p class="welcome-call__judging-note">
          <span aria-hidden="true">*</span>
          For judging, you’ll see this welcome screen every time you log in.
        </p>
      </div>

      <div class="welcome-call__stage">
        <div class="welcome-call__action" aria-live="polite">
          {#if welcomeCall.status === 'complete'}
            <div class="welcome-call__requested">
              <span class="welcome-call__requested-mark" aria-hidden="true">✓</span>
              <div>
                <h2>You’ve heard JooVoice.</h2>
                <p>Your welcome call is complete.</p>
              </div>
              <PbButton onclick={() => void leaveWelcomeCall('continue')} disabled={busy} humanOnly>
                {#if leaving === 'continue'}
                  <span class="welcome-call__spinner" aria-hidden="true"></span>
                  Continuing…
                {:else}
                  Continue to Phonebooth
                {/if}
              </PbButton>
              {#if error}
                <p id="welcome-call-error" class="welcome-call__error" role="alert">{error}</p>
              {/if}
            </div>
          {:else if inFlight}
            <div class="welcome-call__requested">
              <span class="welcome-call__requested-mark" aria-hidden="true">{welcomeCall.status === 'calling' ? '•' : '✓'}</span>
              <div>
                <h2>{welcomeCall.status === 'calling' ? 'Bowlboy’s calling.' : 'Keep your phone nearby.'}</h2>
                <p>
                  {welcomeCall.status === 'calling'
                    ? `Bowlboy is calling ${welcomeCall.phoneAlias ?? 'your number'} now.`
                    : `Your welcome call is lined up for ${welcomeCall.phoneAlias ?? 'your number'}.`}
                </p>
              </div>
              <p class="welcome-call__status-note">
                {welcomeCall.status === 'calling' ? 'You can continue when the greeting ends.' : 'It should begin shortly.'}
              </p>
            </div>
          {:else if canRequest}
            <form onsubmit={requestCall}>
              <PbField label="Your phone number" hint="Include the country code, such as +65.">
                <input
                  bind:value={phone}
                  type="tel"
                  name="phone"
                  autocomplete="tel"
                  inputmode="tel"
                  placeholder="+65 9123 4567"
                  aria-describedby={error ? 'welcome-call-error' : undefined}
                  disabled={busy}
                  required
                />
              </PbField>

              {#if error}
                <p id="welcome-call-error" class="welcome-call__error" role="alert">{error}</p>
              {/if}

              {#if welcomeCall.reason}
                <p class="welcome-call__reason" role="status">{welcomeCall.reason.text}</p>
              {/if}

              <div class="welcome-call__actions">
                <PbButton type="submit" disabled={busy} humanOnly>
                  {#if requesting}
                    <span class="welcome-call__spinner" aria-hidden="true"></span>
                    Requesting your call…
                  {:else}
                    Call me
                  {/if}
                </PbButton>

                <PbButton
                  type="button"
                  size="md"
                  variant="ghost"
                  onclick={() => void leaveWelcomeCall('skip')}
                  disabled={busy}
                  humanOnly
                >
                  {leaving === 'skip' ? 'Skipping…' : 'Skip for now'}
                </PbButton>
              </div>

              <p class="welcome-call__note">This button requests one welcome call to the number above.</p>
            </form>
          {:else}
            <div class="welcome-call__requested">
              <div>
                <h2>Your call list is ready.</h2>
                <p>You can come back to this welcome screen on your next login.</p>
              </div>
              <PbButton onclick={() => void leaveWelcomeCall('skip')} disabled={busy} humanOnly>
                {#if leaving === 'skip'}
                  <span class="welcome-call__spinner" aria-hidden="true"></span>
                  Continuing…
                {:else}
                  Continue to Phonebooth
                {/if}
              </PbButton>
              {#if error}
                <p id="welcome-call-error" class="welcome-call__error" role="alert">{error}</p>
              {/if}
            </div>
          {/if}
        </div>

        <div class="welcome-call__artwork">
          <picture>
            <source
              type="image/webp"
              srcset="/assets/bowlboy-reachout-call-320.webp 320w, /assets/bowlboy-reachout-call-640.webp 640w"
              sizes="(max-width: 420px) 42vw, (max-width: 720px) 176px, 220px"
            />
            <img
              src="/assets/bowlboy-reachout-call-320.png"
              srcset="/assets/bowlboy-reachout-call-320.png 320w, /assets/bowlboy-reachout-call-640.png 640w"
              sizes="(max-width: 420px) 42vw, (max-width: 720px) 176px, 220px"
              width="320"
              height="331"
              alt="Bowlboy reaching out with a telephone receiver"
            />
          </picture>
        </div>
      </div>
    </div>
  </main>
</section>

<style>
  .welcome-call {
    position: relative;
    display: flex;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    flex-direction: column;
    background: var(--theme-bg-app);
  }

  .welcome-call__header {
    position: relative;
    z-index: 2;
    display: flex;
    min-height: 64px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--theme-border-subtle);
    padding: var(--space-3) var(--space-6);
    background: rgb(250 248 245 / 78%);
    backdrop-filter: blur(14px);
  }

  .welcome-call__scroll {
    position: relative;
    z-index: 1;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-8) var(--space-6) var(--space-10);
  }

  .welcome-call__main {
    display: grid;
    width: min(100%, 760px);
    min-height: 100%;
    margin: 0 auto;
    align-content: center;
    padding-bottom: clamp(24px, 7vh, 72px);
    text-align: center;
  }

  .welcome-call__artwork {
    display: grid;
    width: 100%;
    max-width: 220px;
    aspect-ratio: 320 / 331;
    place-items: center;
    justify-self: center;
  }

  .welcome-call__artwork picture,
  .welcome-call__artwork img {
    display: block;
    width: 100%;
    height: auto;
  }

  .welcome-call__copy {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .welcome-call__eyebrow {
    margin: 0 0 var(--space-3);
    color: var(--theme-human-text);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  h1 {
    max-width: 660px;
    margin: 0;
    color: var(--theme-text);
    font-family: var(--font-display);
    font-size: clamp(var(--text-2xl), 4vw, var(--text-3xl));
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
  }

  .welcome-call__intro {
    max-width: 620px;
    margin: var(--space-4) 0 0;
    color: var(--theme-text-muted);
    font-size: var(--text-base);
    line-height: var(--leading-relaxed);
  }

  .welcome-call__judging-note {
    max-width: 560px;
    margin: var(--space-3) 0 0;
    color: var(--theme-text-subtle);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
  }

  .welcome-call__judging-note span {
    margin-right: 0.2em;
    color: var(--theme-human-text);
    font-family: var(--font-mono);
    font-weight: var(--weight-bold);
  }

  .welcome-call__stage {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 480px) minmax(168px, 220px);
    align-items: center;
    justify-content: center;
    gap: var(--space-7);
    margin-top: var(--space-7);
  }

  .welcome-call__action {
    width: 100%;
    min-height: 252px;
    border: 1px solid var(--theme-border-strong);
    border-radius: var(--radius-lg);
    background: rgb(255 253 251 / 88%);
    box-shadow: var(--theme-shadow-lg);
    text-align: left;
  }

  form {
    display: flex;
    min-height: 250px;
    flex-direction: column;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-7);
  }

  .welcome-call__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
  }

  .welcome-call__actions :global(button) {
    width: 100%;
  }

  .welcome-call__requested :global(> button) {
    width: 100%;
    gap: var(--space-2);
  }

  .welcome-call__note,
  .welcome-call__error,
  .welcome-call__requested p {
    margin: 0;
  }

  .welcome-call__note {
    color: var(--theme-text-subtle);
    font-size: var(--text-xs);
    line-height: var(--leading-normal);
    text-align: center;
  }

  .welcome-call__error {
    color: var(--theme-error);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .welcome-call__reason {
    margin: var(--space-3) 0 0;
    color: var(--theme-text-muted);
    font-size: var(--text-sm);
    line-height: 1.55;
  }

  .welcome-call__spinner {
    width: 1em;
    height: 1em;
    border: 2px solid rgb(255 255 255 / 46%);
    border-top-color: currentColor;
    border-radius: var(--radius-full);
    animation: welcome-call-spin 700ms linear infinite;
  }

  .welcome-call__requested {
    display: flex;
    min-height: 250px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-7);
    text-align: center;
  }

  .welcome-call__requested-mark {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: var(--radius-full);
    background: var(--theme-success-soft);
    color: var(--theme-success-text);
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
  }

  .welcome-call__requested h2 {
    margin: 0 0 var(--space-1);
    color: var(--theme-text);
    font-size: var(--text-xl);
    font-weight: var(--weight-regular);
  }

  .welcome-call__requested p {
    color: var(--theme-text-muted);
    font-size: var(--text-sm);
  }

  .welcome-call__requested .welcome-call__status-note {
    color: var(--theme-text-subtle);
    font-size: var(--text-xs);
  }

  .welcome-call__requested .welcome-call__error {
    color: var(--theme-error);
    font-size: var(--text-sm);
  }

  .welcome-call__glow {
    position: fixed;
    border-radius: 50%;
    opacity: 0.34;
    pointer-events: none;
  }

  .welcome-call__glow--coral {
    top: 6%;
    left: -9%;
    width: min(38vw, 500px);
    aspect-ratio: 1;
    background: radial-gradient(circle, rgb(244 184 197 / 34%), transparent 68%);
  }

  .welcome-call__glow--lavender {
    right: -10%;
    bottom: 2%;
    width: min(42vw, 560px);
    aspect-ratio: 1;
    background: radial-gradient(circle, rgb(201 184 224 / 38%), transparent 68%);
  }

  @keyframes welcome-call-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 720px) {
    .welcome-call__header {
      min-height: 56px;
      padding: var(--space-2) var(--space-4);
    }

    .welcome-call__scroll {
      padding: var(--space-7) var(--space-4) var(--space-8);
    }

    .welcome-call__main {
      align-content: start;
      padding-bottom: 0;
    }

    .welcome-call__stage {
      grid-template-columns: 1fr;
      gap: var(--space-6);
      margin-top: var(--space-6);
    }

    .welcome-call__artwork {
      width: clamp(136px, 42vw, 176px);
    }

    form,
    .welcome-call__requested {
      padding: var(--space-5);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .welcome-call__spinner {
      animation: none;
    }
  }
</style>

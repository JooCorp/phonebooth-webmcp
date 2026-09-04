<script lang="ts">
  import { PbButton, PbCard, PbField } from '@phonebooth/design';
  import { browserTimezone } from '$lib/store.svelte.ts';
  import type { CreateCallRequestInput, ErrorGuide, StatusObject } from '$lib/types.ts';

  let {
    onSubmit,
  }: {
    onSubmit: (input: CreateCallRequestInput) => Promise<{ ok: true; value: StatusObject } | { ok: false; guide: ErrorGuide } | null>;
  } = $props();

  let request = $state('');
  let phone = $state('');
  let busy = $state(false);
  let requestField: HTMLTextAreaElement;

  const possibilities = [
    {
      label: 'Add personality',
      request:
        'Call my friend with the suave energy of her favorite British spy-thriller character. Tell her I appreciate her very much, and ask whether she wants me to bring her anything from my holiday in Bangkok.',
    },
    {
      label: 'Share preferences and a fallback',
      request:
        'Call the restaurant and ask for Peter because he knows my preferences, but it’s okay if he isn’t there. Book a quiet table for four this Friday at 7:30 pm, indoors and away from the kitchen. Ask whether they can prepare a small nut-free birthday dessert, and use your judgment if the exact table is unavailable.',
    },
    {
      label: 'Give context for good judgment',
      request:
        'Call a florist near my mum in Melbourne and ask for something cheerful but not romantic for her first day at a new job. Keep it under A$80 delivered and avoid lilies because of her cat. If they can’t deliver by 9 am tomorrow, ask for the earliest realistic option.',
    },
  ] as const;

  function normalizedPhone(value: string): string {
    const trimmed = value.trim();
    return `${trimmed.startsWith('+') ? '+' : ''}${trimmed.replace(/\D/g, '')}`;
  }

  function usePossibility(value: string): void {
    request = value;
    requestField.focus();
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    try {
      const input: CreateCallRequestInput = {
        request: request.trim(),
        phone: normalizedPhone(phone),
        ownerTimezone: browserTimezone(),
        callNow: true,
      };
      const result = await onSubmit(input);
      if (result?.ok) {
        request = '';
        phone = '';
      }
    } finally {
      busy = false;
    }
  }
</script>

<PbCard as="section" ariaLabel="Make a call" class="overflow-hidden p-0 sm:p-0">
  <header class="border-b border-line px-5 py-5 sm:px-7">
    <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-human-text uppercase">
      From you
    </p>
    <h2 class="mt-2 mb-0 text-2xl tracking-tight text-ink">Make a call</h2>
    <p class="mt-2 mb-0 max-w-2xl text-sm leading-relaxed text-muted">
      Give us the number and the idea. Your request can be practical, thoughtful, playful—or all three.
    </p>
  </header>

  <form onsubmit={submit} class="flex flex-col gap-5 px-5 py-5 sm:px-7 sm:py-6">
    <div class="grid gap-3">
      <PbField label="What do you want us to call about?" hint="Required">
        <textarea
          bind:this={requestField}
          name="request"
          bind:value={request}
          required
          maxlength="2000"
          rows="5"
          placeholder="Tell us what you want to happen, what matters to you, and anything we should know."
        ></textarea>
      </PbField>

      <div class="rounded-sm border border-agent/25 bg-agent-soft/55 px-4 py-4 sm:px-5">
        <p class="m-0 text-sm leading-relaxed text-muted">
          You can give us a very vague request and we’ll do well. Often, the more detail you add, the better the call.
        </p>

        <details class="group mt-2">
          <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-agent underline decoration-agent/30 underline-offset-4 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span>See the possibilities</span>
            <span class="grid size-9 shrink-0 place-items-center rounded-full border border-agent/25 bg-surface/70 text-agent" aria-hidden="true">
              <svg
                class="size-5 transition-transform duration-fast group-open:rotate-180 motion-reduce:transition-none"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m4.5 7.25 5.5 5.5 5.5-5.5"></path>
              </svg>
            </span>
          </summary>

          <div class="grid gap-3 border-t border-agent/20 pt-4 lg:grid-cols-3">
            {#each possibilities as possibility (possibility.label)}
              <article class="flex min-w-0 flex-col rounded-sm border border-agent/20 bg-surface-warm p-4 shadow-[var(--theme-shadow-xs)]">
                <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-agent uppercase">
                  {possibility.label}
                </p>
                <p class="mt-3 mb-0 text-sm leading-relaxed text-muted">“{possibility.request}”</p>
                <button
                  type="button"
                  class="mt-auto min-h-11 cursor-pointer self-start border-0 bg-transparent pt-4 text-sm font-semibold text-link underline underline-offset-4 hover:text-link-hover"
                  onclick={() => usePossibility(possibility.request)}
                  aria-label={`Use the “${possibility.label}” example`}
                >Use this idea</button>
              </article>
            {/each}
          </div>
        </details>
      </div>
    </div>

    <PbField label="Number to call" hint="Required · Include the country code so we can understand local time there.">
      <input
        type="tel"
        name="phone"
        bind:value={phone}
        required
        autocomplete="tel"
        inputmode="tel"
        placeholder="+65 9123 4567"
        pattern={'^\\+[1-9][0-9\\x20\\x28\\x29\\x2D]{6,23}$'}
        title="Enter an international number beginning with +."
      />
    </PbField>

    <div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-t border-line pt-5">
      <div class="min-w-0 max-w-2xl">
        <p class="m-0 text-xs leading-relaxed text-muted" aria-label="Calling availability">
          <span class="mr-1 font-[var(--font-mono)] font-bold text-human-text" aria-hidden="true">*</span>
          <strong class="text-human-text">Scheduling isn’t available yet.</strong>
          You’ll choose when to start with <strong class="font-semibold text-ink">Place this call</strong>.
        </p>
        <p class="mt-1 mb-0 text-xs leading-relaxed text-faint">We use your computer’s timezone automatically.</p>
      </div>
      <PbButton type="submit" size="md" disabled={busy}>{busy ? 'Creating…' : 'Create call'}</PbButton>
    </div>
  </form>
</PbCard>

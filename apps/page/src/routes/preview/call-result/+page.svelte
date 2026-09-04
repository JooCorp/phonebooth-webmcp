<script lang="ts">
  import { goto } from '$app/navigation';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import CallResultCanvas from '$lib/components/CallResultCanvas.svelte';
  import type { StatusObject } from '$lib/types.ts';

  let status = $state<StatusObject>({
    callRequestId: 'cr_demo_basilico',
    status: 'done',
    meaning: 'The call ended. Result attached.',
    sayToOwner: 'Basilico confirmed the reservation.',
    next: [],
    request: 'Reserve a table for two at Basilico this Saturday at 7:30 pm.',
    calleeAlias: 'Basilico Restaurant',
    createdAt: '2026-09-04T11:12:18.000Z',
    updatedAt: '2026-09-04T11:14:00.000Z',
    result: {
      objectiveSucceeded: true,
      summary: 'Basilico booked a table for two on Saturday, 5 September at 7:30 pm.',
      facts: [
        { label: 'Date', value: 'Saturday, 5 September' },
        { label: 'Time', value: '7:30 pm' },
        { label: 'Party', value: '2 people' },
        { label: 'Confirmation', value: 'JT-4821' },
      ],
      endedBecause: 'completed',
      durationSeconds: 102,
      untrustedContent: true,
      presentation: {
        schemaVersion: 'call-result-presentation-v1',
        outcomeLabel: 'Objective reached',
        headline: 'Your reservation is confirmed.',
        sections: [
          {
            id: 'reported-details',
            state: 'filled',
            label: 'Reported on the call',
            title: 'What Basilico confirmed',
            description: 'These details came from the restaurant during the conversation.',
            fields: [
              { id: 'date', label: 'Date', value: 'Saturday, 5 September' },
              { id: 'time', label: 'Time', value: '7:30 pm' },
              { id: 'party', label: 'Party', value: '2 people' },
              { id: 'confirmation', label: 'Confirmation', value: 'JT-4821' },
            ],
            notes: {
              label: 'Additional information',
              items: ['Please bring a photo ID for the reservation holder.'],
            },
          },
          {
            id: 'payment-details',
            state: 'empty',
            label: 'Payment',
            title: 'Payment details',
            description: 'This call did not produce payment details, so the page omits this section.',
            fields: [],
          },
        ],
        recording: {
          state: 'filled',
          downloadUrl: '/api/call-results/call_demo_basilico/recording',
          filename: 'phonebooth-basilico-call.m4a',
          format: 'M4A',
          duration: '1:42',
        },
        transcript: {
          state: 'filled',
          label: 'View call transcript',
          duration: '1 min 42 sec',
          disclosure:
            'Transcript content is reported speech from the call. Names and reference numbers may need independent confirmation.',
          lines: [
            { id: 'line-1', speaker: 'Restaurant', time: '0:04', text: 'Basilico, good evening.' },
            {
              id: 'line-2',
              speaker: 'Your agent',
              time: '0:08',
              text: 'Hi, I’m calling to reserve a table for two this Saturday at 7:30 in the evening.',
            },
            {
              id: 'line-3',
              speaker: 'Restaurant',
              time: '0:47',
              text: 'We have a table available. May I have the name for the reservation?',
            },
            {
              id: 'line-4',
              speaker: 'Restaurant',
              time: '1:31',
              text: 'That’s confirmed. Please bring a photo ID. Your confirmation is JT-4821.',
            },
          ],
        },
        footerNote:
          'Phonebooth keeps the outcome visible here so you do not need to replay the call to know what happened.',
      },
    },
  });

  const pageHeadline = $derived(
    status.result?.presentation?.headline?.trim() || 'Call result',
  );
  const pageDescription = $derived(
    status.result?.summary || 'A completed Phonebooth call and its reported outcome.',
  );

  function makeNewCall() {
    void goto('/?new-call=1');
  }
</script>

<svelte:head>
  <title>{pageHeadline} · Phonebooth</title>
  <meta name="description" content={pageDescription} />
</svelte:head>

<div class="relative grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-app">
  <div
    class="pointer-events-none absolute -top-36 -right-40 h-96 w-96 rounded-full bg-[radial-gradient(circle,var(--theme-agent-soft),transparent_68%)] opacity-80"
    aria-hidden="true"
  ></div>
  <div
    class="pointer-events-none absolute -bottom-44 -left-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,var(--theme-human-soft),transparent_68%)] opacity-65"
    aria-hidden="true"
  ></div>

  <AppHeader />

  <main class="relative z-10 min-h-0 overflow-y-auto overscroll-contain px-5 py-8 sm:px-8 sm:py-12">
    <div class="mx-auto w-full max-w-5xl">
      <a
        href="/"
        class="mb-7 inline-flex min-h-11 items-center text-sm font-semibold text-muted no-underline hover:text-ink"
      >
        <span class="mr-2" aria-hidden="true">←</span>
        All calls
      </a>

      <CallResultCanvas {status} onCreateNewCall={makeNewCall} />
    </div>
  </main>
</div>

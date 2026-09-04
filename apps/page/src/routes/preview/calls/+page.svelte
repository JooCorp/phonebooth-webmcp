<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import type { ListedTool } from '@joovoice/state-as-tools';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import CallsWorkspace from '$lib/components/CallsWorkspace.svelte';
  import { loadLocalFeaturedActions } from '$lib/featured-actions-local.ts';
  import type { AccountObject, CallRequestStatus, FeaturedActionsState, StatusObject } from '$lib/types.ts';

  type PreviewState = 'empty' | 'list' | 'queued_approval' | CallRequestStatus;

  const allowedStates = new Set<PreviewState>([
    'empty',
    'list',
    'thinking',
    'needs_answers',
    'queued',
    'queued_approval',
    'calling',
    'done',
    'not_placed',
    'cancelled',
  ]);

  const account: AccountObject = {
    loggedIn: true,
    accountState: 'active',
    displayName: 'Jamie',
    welcomeCall: { status: 'complete', phoneAlias: '+65…12', acknowledged: true },
    blockers: [],
    phone: { verified: true, alias: '+65…12', reportBackConsented: true },
    urls: { web: '/', dashboard: '/', connect: '/' },
    sayToOwner: 'Ready to make calls.',
    next: [],
    docs: [],
  };

  let featuredActions = $state<FeaturedActionsState>({
    schemaVersion: 'featured-actions-v1',
    revision: 1,
    eyebrow: 'A timely extra',
    title: 'Prepared for you',
    description: 'Choose one of the available options below.',
    caution: 'Review the details before continuing.',
    items: [
      {
        id: 'sample_one',
        label: 'Option one',
        allowance: { limit: 2, remaining: 2, label: '2 of 2 left' },
        available: true,
        statusText: 'Available now.',
        actionLabel: 'Choose one',
        fields: [{ id: 'phone', kind: 'phone', label: 'Phone number', placeholder: '+1 202 555 0147', required: true }],
      },
      {
        id: 'sample_two',
        label: 'Option two',
        available: true,
        statusText: 'Available now.',
        actionLabel: 'Choose two',
        fields: [{ id: 'phone', kind: 'phone', label: 'Phone number', placeholder: '+1 202 555 0188', required: true }],
      },
    ],
    footer: 'Availability is enforced by the service.',
    sayToOwner: 'Two featured actions are available.',
  });

  onMount(() => {
    void loadLocalFeaturedActions().then((local) => {
      if (local) featuredActions = local;
    });
  });

  const tools: ListedTool[] = [
    {
      groupId: 'static',
      state: 'static',
      name: 'create_call_request',
      description: 'Create a call request.',
      annotations: {},
    },
    {
      groupId: 'static',
      state: 'static',
      name: 'list_call_requests',
      description: 'List call requests.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    },
    {
      groupId: 'cr_preview',
      state: 'calling:connected:none:',
      name: 'wait_for_preview',
      description: 'Wait for the next request update.',
      annotations: { readOnlyHint: true, untrustedContentHint: true },
    },
  ];

  const previewState = $derived.by<PreviewState>(() => {
    const value = page.url.searchParams.get('state') as PreviewState | null;
    return value && allowedStates.has(value) ? value : 'thinking';
  });

  function previewRequest(status: CallRequestStatus, overrides: Partial<StatusObject> = {}): StatusObject {
    const base: StatusObject = {
      callRequestId: 'cr_preview_basilico',
      revision: 4,
      status,
      meaning: `The request is ${status}.`,
      sayToOwner: `The request is ${status}.`,
      next: [],
      request: 'Reserve a table for two this Friday at 7:30 pm.',
      calleeAlias: 'Basilico Restaurant',
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:02:00.000Z',
    };

    if (status === 'needs_answers') {
      base.questionSetId = 'qs_preview';
      base.canContinueWithoutOptional = true;
      base.questions = [
        {
          id: 'booking_name',
          label: 'Whose name should the booking be under?',
          required: true,
          kind: 'text',
          sensitivity: 'sensitive',
          input: { kind: 'text', placeholder: 'Jamie Tan' },
          whyWeAsk: 'The restaurant needs a name to hold the table.',
          example: 'Jamie Tan',
        },
        {
          id: 'later_time',
          label: 'If 7:30 pm is unavailable, what should JooVoice do?',
          required: true,
          kind: 'choice',
          sensitivity: 'public',
          input: {
            kind: 'single_choice',
            choices: [
              { id: 'later', label: 'Try a later time', description: 'Anything before 9 pm works.' },
              { id: 'earlier', label: 'Try an earlier time', description: 'Anything after 6 pm works.' },
              { id: 'exact', label: 'Keep 7:30 pm', description: 'Do not book another time.' },
            ],
          },
          whyWeAsk: 'This gives the caller a clear fallback without interrupting you.',
        },
        {
          id: 'seating',
          label: 'Where would you prefer to sit?',
          required: false,
          kind: 'choice',
          sensitivity: 'public',
          input: {
            kind: 'single_choice',
            choices: [
              { id: 'best', label: 'Best available' },
              { id: 'quiet', label: 'Quiet area' },
              { id: 'window', label: 'By a window' },
              { id: 'outdoors', label: 'Outdoors' },
              { id: 'counter', label: 'Counter seating' },
              { id: 'accessible', label: 'Step-free table' },
            ],
          },
          whyWeAsk: 'The restaurant may ask where you would like to sit.',
        },
      ];
    }
    if (status === 'queued') {
      base.window = {
        text: 'JooVoice will place this call shortly.',
        notBefore: '2026-09-04T10:05:00.000Z',
      };
    }
    if (status === 'calling') base.live = { phase: 'connected', seconds: 42 };
    if (status === 'done') {
      base.reportBack = { available: true, status: 'none', tool: 'request_report_back_call', once: true };
      base.result = {
        objectiveSucceeded: true,
        summary: 'Basilico confirmed a table for two at 7:30 pm on Friday.',
        facts: [
          { label: 'Time', value: '7:30 pm' },
          { label: 'Party', value: '2 people' },
        ],
        endedBecause: 'completed',
        durationSeconds: 102,
        untrustedContent: true,
        presentation: {
          schemaVersion: 'call-result-presentation-v1',
          headline: 'Your reservation is confirmed.',
        },
      };
    }
    if (status === 'not_placed') {
      base.reason = { code: 'not_answered', text: 'No one answered after two attempts.' };
      base.retryNow = true;
      base.attemptSummary = { count: 2 };
      base.next = [{
        tool: 'retry_call_request',
        args: { callRequestId: base.callRequestId, revision: base.revision },
      }];
    }
    return { ...base, ...overrides };
  }

  function previewListRequests(): StatusObject[] {
    return [
      previewRequest('calling', {
        callRequestId: 'cr_preview_hair',
        request: 'Ask whether Mei can fit me in for a trim this afternoon. If she is unavailable, find the closest time with someone she recommends.',
        calleeAlias: 'Kintsugi Hair Studio',
        createdAt: '2026-09-04T12:35:00.000Z',
        updatedAt: '2026-09-04T12:42:00.000Z',
        live: { phase: 'connected', seconds: 48 },
      }),
      previewRequest('needs_answers', {
        callRequestId: 'cr_preview_hotel',
        request: 'Arrange a late check-in after midnight and ask for the quietest room near an elevator, but not beside it.',
        calleeAlias: 'The Fullerton Bay Hotel',
        createdAt: '2026-09-04T12:10:00.000Z',
        updatedAt: '2026-09-04T12:18:00.000Z',
      }),
      previewRequest('queued', {
        callRequestId: 'cr_preview_friend',
        request: 'Tell Priya I appreciate her and ask whether she wants anything brought back from Bangkok.',
        calleeAlias: 'Priya',
        createdAt: '2026-09-04T11:50:00.000Z',
        updatedAt: '2026-09-04T11:58:00.000Z',
        callNow: true,
        window: { text: 'Waiting for you to place the call.' },
      }),
      previewRequest('done', {
        callRequestId: 'cr_preview_basilico_done',
        createdAt: '2026-09-04T09:20:00.000Z',
        updatedAt: '2026-09-04T09:29:00.000Z',
      }),
      previewRequest('done', {
        callRequestId: 'cr_preview_florist',
        request: 'Find a cheerful, cat-safe arrangement under A$80 for Mum’s first day at her new job.',
        calleeAlias: 'Orchid & Stem Florist',
        createdAt: '2026-09-03T06:05:00.000Z',
        updatedAt: '2026-09-03T06:17:00.000Z',
        result: {
          objectiveSucceeded: true,
          summary: 'A bright native arrangement will arrive before 9 am.',
          facts: [
            { label: 'Delivery', value: 'Before 9 am' },
            { label: 'Total', value: 'A$76' },
          ],
          endedBecause: 'completed',
          durationSeconds: 146,
          untrustedContent: true,
        },
      }),
      previewRequest('not_placed', {
        callRequestId: 'cr_preview_clinic',
        request: 'Ask whether Dr. Lim has an earlier appointment available this week.',
        calleeAlias: 'Dr. Lim’s Clinic',
        createdAt: '2026-09-02T08:15:00.000Z',
        updatedAt: '2026-09-02T08:24:00.000Z',
        reason: { code: 'not_answered', text: 'No one answered after two attempts.' },
        retryNow: true,
        attemptSummary: { count: 2 },
        next: [{ tool: 'retry_call_request', args: { callRequestId: 'cr_preview_clinic', revision: 4 } }],
      }),
      previewRequest('cancelled', {
        callRequestId: 'cr_preview_airline',
        request: 'Ask whether my return flight can be moved to Sunday evening.',
        calleeAlias: 'Bangkok Airways',
        createdAt: '2026-09-01T03:10:00.000Z',
        updatedAt: '2026-09-01T03:12:00.000Z',
      }),
    ];
  }

  const focusedRequest = $derived.by<StatusObject | undefined>(() => {
    if (previewState === 'empty' || previewState === 'list') return undefined;
    const request = previewRequest(previewState === 'queued_approval' ? 'queued' : previewState);
    if (previewState === 'queued_approval') request.callNow = true;
    return request;
  });
  const requests = $derived(previewState === 'list' ? previewListRequests() : focusedRequest ? [focusedRequest] : []);

  function viewResult() {
    void goto('/preview/call-result');
  }

  function allCalls() {
    void goto('/preview/calls?state=list');
  }

  function hrefForRequest(request: StatusObject): string {
    if (request.status === 'done' && request.result) return '/preview/call-result';
    const state = request.status === 'queued' && request.callNow ? 'queued_approval' : request.status;
    return `/preview/calls?state=${state}`;
  }

  async function triggerFeaturedAction(id: string, values: Record<string, string>, expectedRevision: number) {
    if (expectedRevision !== featuredActions.revision) {
      return {
        ok: false as const,
        guide: {
          kind: 'not_allowed_right_now' as const,
          headline: 'The featured actions changed',
          fix: 'Check them again before continuing.',
          next: [{ tool: 'check_featured_actions', args: {} }],
          sayToOwner: 'The featured-action availability changed.',
        },
      };
    }
    if (!values.phone?.trim()) {
      return {
        ok: false as const,
        guide: {
          kind: 'fix_the_request' as const,
          headline: 'A field is missing',
          fix: 'Enter the required phone number.',
          next: [],
          sayToOwner: 'A phone number is required.',
        },
      };
    }
    const calledAt = new Date();
    featuredActions = {
      ...featuredActions,
      revision: featuredActions.revision + 1,
      items: featuredActions.items.map((item) =>
        item.id === id ? triggerPreviewItem(item, calledAt) : item,
      ),
      sayToOwner: 'The selected action was triggered.',
    };
    return { ok: true as const, value: featuredActions };
  }

  function triggerPreviewItem(item: FeaturedActionsState['items'][number], calledAt: Date): FeaturedActionsState['items'][number] {
    const nextRemaining = item.allowance ? Math.max(0, item.allowance.remaining - 1) : undefined;
    const allowance = item.allowance && nextRemaining !== undefined
      ? {
          ...item.allowance,
          remaining: nextRemaining,
          ...(item.allowance.label ? { label: `${nextRemaining} of ${item.allowance.limit} left` } : {}),
        }
      : undefined;
    return {
      ...item,
      available: allowance ? allowance.remaining > 0 : false,
      ...(allowance ? { allowance } : {}),
      statusText: item.triggeredStatusText ?? 'Used recently.',
      lastTriggeredAt: calledAt.toISOString(),
    };
  }
</script>

<svelte:head>
  <title>Calls workspace preview · Phonebooth</title>
</svelte:head>

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
    <CallsWorkspace
      {account}
      {featuredActions}
      phase="ready"
      mode="simulation"
      serviceError={null}
      guide={null}
      {requests}
      {focusedRequest}
      {tools}
      webmcpAvailable
      declarativeForms
      streamDown={page.url.searchParams.get('stream') === 'down'}
      onCreate={() => Promise.resolve(null)}
      onAnswer={() => undefined}
      onCancel={() => undefined}
      onPlace={() => undefined}
      onRetry={() => undefined}
      onReportBack={() => undefined}
      onViewResult={viewResult}
      onReturnToCalls={allCalls}
      {hrefForRequest}
      onSignIn={() => undefined}
      onTriggerFeaturedAction={triggerFeaturedAction}
    />
  </main>
</div>

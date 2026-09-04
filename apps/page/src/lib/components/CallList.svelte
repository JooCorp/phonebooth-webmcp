<script lang="ts">
  import CalleeAvatar from '$lib/components/CalleeAvatar.svelte';
  import {
    formatRequestTime,
    requestStatusLabel,
    requestTone,
    type RequestTone,
  } from '$lib/calls-workspace.ts';
  import type { StatusObject } from '$lib/types.ts';

  let {
    requests,
    ariaLabel,
    hrefForRequest,
  }: {
    requests: StatusObject[];
    ariaLabel: string;
    hrefForRequest: (request: StatusObject) => string;
  } = $props();

  const toneClasses: Record<RequestTone, string> = {
    agent: 'border-agent/25 bg-agent-soft text-agent',
    human: 'border-human/25 bg-human-soft text-human-text',
    time: 'border-time/30 bg-time-soft text-time',
    success: 'border-success/25 bg-success-soft text-success-text',
    warning: 'border-warning/30 bg-warning-soft text-warning-text',
    muted: 'border-line bg-subtle text-muted',
  };
</script>

<ol
  class="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-sm border border-line bg-surface-warm p-0 shadow-[var(--theme-shadow-xs)]"
  aria-label={ariaLabel}
>
  {#each requests as request (request.callRequestId)}
    <li>
      <a
        href={hrefForRequest(request)}
        class="group grid min-h-20 gap-3 px-4 py-4 text-inherit no-underline hover:bg-subtle focus-visible:bg-subtle sm:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.2fr)_auto] sm:items-center sm:px-5"
        aria-label={`${request.calleeAlias}: ${requestStatusLabel(request.status)}. ${request.request}`}
      >
        <div class="flex min-w-0 items-center gap-3">
          <CalleeAvatar size="sm" />
          <div class="min-w-0">
            <p class="m-0 truncate text-sm font-semibold text-ink">{request.calleeAlias}</p>
            <p class="mt-1 mb-0 font-[var(--font-mono)] text-2xs leading-normal text-faint uppercase">
              {formatRequestTime(request.updatedAt)}
            </p>
          </div>
        </div>

        <p class="m-0 min-w-0 text-sm leading-relaxed text-muted sm:truncate">{request.request}</p>

        <span
          class={`w-fit rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wide)] uppercase ${toneClasses[requestTone(request)]}`}
        >
          {requestStatusLabel(request.status)}
        </span>
      </a>
    </li>
  {/each}
</ol>

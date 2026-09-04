<script lang="ts">
  import { PbButton, PbCard } from '@phonebooth/design';
  import {
    callResultCanvasFromStatus,
    visibleMetadata,
    visibleResultFields,
    visibleResultSections,
    visibleTranscriptLines,
    type CallResultTone,
  } from '$lib/call-result-canvas.ts';
  import type { StatusObject } from '$lib/types.ts';

  let {
    status,
    onCreateNewCall,
  }: {
    status: StatusObject;
    onCreateNewCall?: () => void;
  } = $props();

  const result = $derived(
    callResultCanvasFromStatus(status, { canCreateNewCall: Boolean(onCreateNewCall) }),
  );
  const sections = $derived(visibleResultSections(result?.sections));
  const receiptFields = $derived(visibleResultFields(result?.receipt?.fields));
  const metadata = $derived(visibleMetadata(result?.outcome.metadata));
  const transcriptLines = $derived(visibleTranscriptLines(result?.transcript));
  const canCreateNewCall = $derived(Boolean(result?.actions?.canCreateNewCall && onCreateNewCall));
  const hasReceipt = $derived(
    Boolean(result?.receipt && (result.receipt.title?.trim() || receiptFields.length > 0)),
  );
  const hasSideRail = $derived(hasReceipt || Boolean(result?.recording) || canCreateNewCall);
  const hasCanvas = $derived(sections.length > 0 || hasSideRail);

  const tones: Record<CallResultTone, { icon: string; iconClass: string; labelClass: string }> = {
    success: {
      icon: '✓',
      iconClass: 'bg-success-soft text-success-text',
      labelClass: 'text-success-text',
    },
    partial: {
      icon: '!',
      iconClass: 'bg-warning-soft text-warning-text',
      labelClass: 'text-warning-text',
    },
    failure: {
      icon: '×',
      iconClass: 'bg-error-soft text-error',
      labelClass: 'text-error',
    },
  };

  const tone = $derived(tones[result?.outcome.tone ?? 'partial']);
</script>

{#if result}
<section aria-labelledby="call-result-title" class="max-w-3xl" data-untrusted>
  <div class="mb-5 flex items-center gap-3">
    <span
      class={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold ${tone.iconClass}`}
      aria-hidden="true"
    >{tone.icon}</span>
    <p
      class={`m-0 font-[var(--font-mono)] text-xs font-semibold tracking-[var(--tracking-widest)] uppercase ${tone.labelClass}`}
    >
      {result.outcome.label}
    </p>
  </div>

  <h1 id="call-result-title" class="m-0 max-w-3xl text-3xl tracking-tight text-ink sm:text-4xl">
    {result.outcome.headline}
  </h1>
  {#if result.outcome.summary?.trim()}
    <p class="mt-5 max-w-3xl text-lg leading-relaxed text-muted sm:text-lead">
      {result.outcome.summary}
    </p>
  {/if}
  {#if metadata.length > 0}
    <p class="mt-4 font-[var(--font-mono)] text-xs tracking-[var(--tracking-wide)] text-faint uppercase">
      {metadata.join(' · ')}
    </p>
  {/if}
</section>

{#if hasCanvas}
  <div
    class={`mt-10 grid items-start gap-6 ${sections.length > 0 && hasSideRail ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(17rem,0.8fr)]' : 'max-w-3xl'}`}
  >
    {#if sections.length > 0}
      <div class="flex min-w-0 flex-col gap-6">
        {#each sections as section (section.id)}
          <PbCard as="section" ariaLabel={section.title} dataStatus={section.state} class="p-0 sm:p-0">
            <header class="px-5 py-5 sm:px-6">
              <div class="flex flex-wrap items-start justify-between gap-3">
                {#if section.label?.trim()}
                  <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
                    {section.label}
                  </p>
                {/if}
                {#if section.state === 'partial'}
                  <span class="rounded-full bg-warning-soft px-2 py-1 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-warning-text uppercase">
                    Partial
                  </span>
                {/if}
              </div>
              <h2 class={`${section.label?.trim() ? 'mt-2' : 'mt-0'} mb-0 text-xl text-ink`}>
                {section.title}
              </h2>
              {#if section.description?.trim()}
                <p class="mt-2 mb-0 text-sm leading-relaxed text-muted">
                  {section.description}
                </p>
              {/if}
            </header>

            {#if section.fields && section.fields.length > 0}
              <dl class="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-px border-t border-line bg-line">
                {#each section.fields as field, index (field.id)}
                  <div
                    class={`min-w-0 bg-surface-warm px-5 py-4 sm:px-6 ${section.fields.length > 1 && section.fields.length % 2 === 1 && index === section.fields.length - 1 ? '[grid-column:1/-1]' : ''}`}
                  >
                    <dt class="font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-wider)] text-faint uppercase">
                      {field.label}
                    </dt>
                    <dd class="mt-1.5 ml-0 break-words font-semibold text-ink">{field.value}</dd>
                  </div>
                {/each}
              </dl>
            {/if}

            {#if section.notes}
              <section class="border-t border-line px-5 py-5 sm:px-6" aria-label={section.notes.label}>
                <h3 class="m-0 text-base text-ink">{section.notes.label}</h3>
                <ul class="mt-3 mb-0 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-muted">
                  {#each section.notes.items as item, index (`${index}:${item}`)}
                    <li>{item}</li>
                  {/each}
                </ul>
              </section>
            {/if}
          </PbCard>
        {/each}
      </div>
    {/if}

    {#if hasSideRail}
      <aside class="min-w-0 lg:sticky lg:top-0" aria-label="Call receipt and actions">
        <PbCard class="flex flex-col gap-5" ariaLabel="Call receipt">
          {#if hasReceipt}
            <div>
              {#if result.receipt?.label?.trim()}
                <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
                  {result.receipt.label}
                </p>
              {/if}
              {#if result.receipt?.title?.trim()}
                <p class={`${result.receipt.label?.trim() ? 'mt-2' : 'mt-0'} mb-0 font-semibold text-ink`}>
                  {result.receipt.title}
                </p>
              {/if}
            </div>

            {#if receiptFields.length > 0}
              <dl class="m-0 border-t border-line">
                {#each receiptFields as field (field.id)}
                  <div class="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b border-line py-3 text-sm last:border-b-0">
                    <dt class="text-faint">{field.label}</dt>
                    <dd class="m-0 min-w-0 break-words text-right font-semibold text-ink">{field.value}</dd>
                  </div>
                {/each}
              </dl>
            {/if}
          {/if}

          {#if canCreateNewCall}
            <div class="[&>button]:w-full">
              <PbButton size="md" onclick={onCreateNewCall}>Make a new call</PbButton>
            </div>
          {/if}

          {#if result.recording}
            <section class="border-t border-line pt-4" aria-label="Call recording">
              <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
                Recording
              </p>
              <a
                class="mt-2 flex min-h-11 items-center justify-between gap-4 rounded-xs text-sm font-semibold text-link underline decoration-line-strong decoration-1 underline-offset-4 hover:text-link-hover"
                href={result.recording.downloadUrl}
                download={result.recording.filename}
              >
                <span>Download recording</span>
                {#if result.recording.format?.trim() || result.recording.duration?.trim()}
                  <span class="shrink-0 font-[var(--font-mono)] text-2xs font-normal tracking-[var(--tracking-wide)] text-faint uppercase">
                    {[result.recording.format, result.recording.duration].filter(Boolean).join(' · ')}
                  </span>
                {/if}
              </a>
            </section>
          {/if}
        </PbCard>
      </aside>
    {/if}
  </div>
{/if}

{#if result.transcript && transcriptLines.length > 0}
  <details class="group mt-6 rounded-sm border border-line bg-surface-warm shadow-[var(--theme-shadow-xs)]">
    <summary
      class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-semibold text-ink [&::-webkit-details-marker]:hidden sm:px-6"
    >
      <span>{result.transcript.label?.trim() || 'View call transcript'}</span>
      <span class="flex items-center gap-3">
        {#if result.transcript.duration?.trim()}
          <span class="font-[var(--font-mono)] text-2xs font-normal tracking-[var(--tracking-wide)] text-faint uppercase">
            {result.transcript.duration}
          </span>
        {/if}
        <span class="text-lg text-muted transition-transform duration-fast group-open:rotate-45" aria-hidden="true">+</span>
      </span>
    </summary>

    <div class="border-t border-line px-5 py-5 sm:px-6" data-untrusted>
      <p class="mt-0 mb-5 text-sm leading-relaxed text-muted">
        {result.transcript.disclosure?.trim() || 'Transcript content is reported speech from the call and may need independent confirmation.'}
      </p>
      <ol class="m-0 flex list-none flex-col gap-5 p-0">
        {#each transcriptLines as line (line.id)}
          <li class="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
            <div class="flex items-baseline justify-between gap-3 sm:block">
              <p class="m-0 text-sm font-semibold text-ink">{line.speaker}</p>
              {#if line.time?.trim()}
                <time class="font-[var(--font-mono)] text-2xs text-faint">{line.time}</time>
              {/if}
            </div>
            <p class="m-0 text-sm leading-relaxed text-muted">{line.text}</p>
          </li>
        {/each}
      </ol>
    </div>
  </details>
{/if}

{#if result.footerNote?.trim()}
  <p class="mx-auto mt-8 mb-3 max-w-2xl text-center text-xs leading-relaxed text-faint">
    {result.footerNote}
  </p>
{/if}
{/if}

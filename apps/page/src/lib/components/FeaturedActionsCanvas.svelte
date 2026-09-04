<script lang="ts">
  import { PbButton, PbCard, PbField } from '@phonebooth/design';
  import type { FeaturedActionsState, Outcome } from '$lib/types.ts';

  let {
    presentation,
    onTrigger,
  }: {
    presentation: FeaturedActionsState;
    onTrigger: (id: string, values: Record<string, string>, expectedRevision: number) => Promise<Outcome<FeaturedActionsState> | null | undefined>;
  } = $props();

  let pending = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let fieldValues = $state<Record<string, string>>({});

  function fieldKey(itemId: string, fieldId: string): string {
    return `${itemId}:${fieldId}`;
  }

  function valuesFor(itemId: string): Record<string, string> {
    const item = presentation.items.find((candidate) => candidate.id === itemId);
    return Object.fromEntries(
      (item?.fields ?? []).map((field) => [field.id, fieldValues[fieldKey(itemId, field.id)]?.trim() ?? '']),
    );
  }

  async function trigger(id: string): Promise<void> {
    pending = id;
    notice = null;
    error = null;
    try {
      const item = presentation.items.find((candidate) => candidate.id === id);
      const values = valuesFor(id);
      if (item?.fields?.some((field) => field.required && !values[field.id])) {
        error = 'Complete the required fields first.';
        return;
      }
      const outcome = await onTrigger(id, values, presentation.revision);
      if (!outcome) error = 'The service is not connected yet.';
      else if (!outcome.ok) error = outcome.guide.fix;
      else notice = outcome.value.sayToOwner;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The action could not be started.';
    } finally {
      pending = null;
    }
  }
</script>

<PbCard as="section" ariaLabel={presentation.title} class="overflow-hidden border-agent/30 bg-agent-soft/40 p-0">
  <div class="border-b border-agent/20 px-5 py-5 sm:px-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="max-w-2xl">
        {#if presentation.eyebrow}
          <p class="m-0 font-[var(--font-mono)] text-2xs font-semibold tracking-[var(--tracking-widest)] text-agent uppercase">
            {presentation.eyebrow}
          </p>
        {/if}
        <h2 class={`${presentation.eyebrow ? 'mt-2' : 'mt-0'} mb-0 text-xl tracking-tight text-ink sm:text-2xl`}>{presentation.title}</h2>
        {#if presentation.description}
          <p class="mt-2 mb-0 text-sm leading-relaxed text-muted">{presentation.description}</p>
        {/if}
        {#if presentation.caution}
          <p class="mt-2 mb-0 text-sm leading-relaxed text-muted">
            {#if presentation.cautionFlair}<span aria-hidden="true">{presentation.cautionFlair}</span>{' '}{/if}{presentation.caution}
          </p>
        {/if}
      </div>
    </div>
  </div>

  <div class={`grid gap-px bg-agent/15 ${presentation.items.length > 1 ? 'sm:grid-cols-2' : ''} ${presentation.items.length > 2 ? 'lg:grid-cols-3' : ''}`}>
    {#each presentation.items as item (item.id)}
      <article class="flex min-h-44 flex-col bg-surface-warm px-5 py-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="m-0 text-base font-semibold text-ink">{item.label}</h3>
            {#if item.detail}
              <p class="mt-1 mb-0 font-[var(--font-mono)] text-xs text-faint">{item.detail}</p>
            {/if}
          </div>
          <div class="flex shrink-0 items-center gap-2.5">
            {#if item.allowance?.label}
              <span class="font-[var(--font-mono)] text-2xs font-medium whitespace-nowrap text-faint">
                {item.allowance.label}
              </span>
            {/if}
            <span class={`h-2.5 w-2.5 shrink-0 rounded-full ${item.available ? 'bg-success' : 'bg-faint'}`} aria-hidden="true"></span>
          </div>
        </div>

        <p class={`mt-3 mb-0 text-xs leading-relaxed ${item.available ? 'text-muted' : 'text-faint'}`}>
          {#if item.flair}<span aria-hidden="true">{item.flair}</span>{' '}{/if}{item.statusText}
        </p>

        {#if item.fields?.length}
          <div class="mt-4 grid gap-3">
            {#each item.fields as field (field.id)}
              <PbField label={field.label} hint={field.hint}>
                <input
                  type={field.kind === 'phone' ? 'tel' : 'text'}
                  inputmode={field.kind === 'phone' ? 'tel' : 'text'}
                  autocomplete={field.kind === 'phone' ? 'tel' : 'off'}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={fieldValues[fieldKey(item.id, field.id)] ?? ''}
                  oninput={(event) => {
                    fieldValues[fieldKey(item.id, field.id)] = event.currentTarget.value;
                    error = null;
                  }}
                />
              </PbField>
            {/each}
          </div>
        {/if}

        <div class="mt-auto pt-5">
          <PbButton
            size="md"
            variant="secondary"
            disabled={!item.available || pending !== null}
            onclick={() => void trigger(item.id)}
          >
            {pending === item.id ? '…' : item.actionLabel}
          </PbButton>
        </div>
      </article>
    {/each}
  </div>

  {#if presentation.footer}
    <div class="border-t border-agent/20 px-5 py-3 sm:px-6">
      <p class="m-0 text-xs leading-relaxed text-muted">{presentation.footer}</p>
    </div>
  {/if}

  {#if notice || error}
    <div
      class={`border-t px-5 py-3 text-sm ${error ? 'border-error/20 bg-error-soft text-error-text' : 'border-success/20 bg-success-soft text-success-text'}`}
      role={error ? 'alert' : 'status'}
      aria-live="polite"
    >
      {error ?? notice}
    </div>
  {/if}
</PbCard>

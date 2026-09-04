<script lang="ts">
  import { PbButton, PbField } from '@phonebooth/design';
  import { answerToolName, choiceFollowupSuffix, stateLine } from '$lib/tools/groups.ts';
  import type { Answer, Question, StatusObject } from '$lib/types.ts';

  let {
    request,
    onSubmit,
  }: {
    request: StatusObject;
    onSubmit: (id: string, questionSetId: string, answers: Answer[], additionalDetails?: string) => void | Promise<unknown>;
  } = $props();

  const selectChoiceThreshold = 6;
  let selectedChoices = $state<Record<string, string>>({});
  let busy = $state(false);
  const hasRestrictedQuestion = $derived(
    (request.questions ?? []).some((question) => question.sensitivity === 'restricted'),
  );

  function paramDescription(question: Question): string {
    return [question.label, question.whyWeAsk, question.prefillHint].filter(Boolean).join(' ');
  }

  function fieldName(question: Question): string | undefined {
    return question.sensitivity === 'restricted' ? undefined : question.id;
  }

  function fieldHint(question: Question): string | undefined {
    if (question.sensitivity !== 'restricted') return question.whyWeAsk;
    return [
      question.whyWeAsk,
      'Only you can enter this here. Phonebooth does not expose it to your agent.',
    ].filter(Boolean).join(' ');
  }

  function restrictedValue(form: HTMLFormElement, questionId: string): string | null {
    const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-question-id]'))
      .filter((control) => control.dataset.questionId === questionId);
    const radio = controls.find((control) => control instanceof HTMLInputElement && control.type === 'radio' && control.checked);
    if (radio) return radio.value;
    return controls[0]?.value ?? null;
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const answers: Answer[] = (request.questions ?? []).flatMap<Answer>((question) => {
      const raw = question.sensitivity === 'restricted'
        ? restrictedValue(form, question.id)
        : data.get(question.id);
      if (typeof raw !== 'string' || raw.trim().length === 0) return [];
      if (question.input.kind !== 'single_choice') return [{ id: question.id, value: raw.trim() }];

      const selected = question.input.choices.find((choice) => choice.id === raw);
      const rawFollowup = question.sensitivity === 'restricted'
        ? restrictedValue(form, `${question.id}${choiceFollowupSuffix}`)
        : data.get(`${question.id}${choiceFollowupSuffix}`);
      const note = selected?.followup && typeof rawFollowup === 'string' ? rawFollowup.trim() : '';
      return [{ id: question.id, choiceId: raw, ...(note ? { note } : {}) }];
    });
    const rawAdditionalDetails = data.get('additionalDetails');
    const additionalDetails = typeof rawAdditionalDetails === 'string' ? rawAdditionalDetails.trim() : '';
    busy = true;
    try {
      await onSubmit(
        request.callRequestId,
        request.questionSetId ?? '',
        answers,
        additionalDetails || undefined,
      );
    } finally {
      busy = false;
    }
  }
</script>

<form
  toolname={answerToolName(request)}
  tooldescription={`${stateLine(request)} Answer the open questions; required ones are listed.`}
  toolautosubmit={!hasRestrictedQuestion}
  onsubmit={submit}
  class="flex flex-col gap-5"
>
  {#each request.questions ?? [] as question (question.id)}
    {#if question.input.kind === 'single_choice'}
      {@const choices = question.input.choices}
      {@const questionName = fieldName(question)}
      {#if choices.length >= selectChoiceThreshold}
        <PbField
          label={`${question.label}${question.required ? ' (required)' : ''}`}
          hint={fieldHint(question)}
        >
          <select
            name={questionName}
            data-question-id={question.sensitivity === 'restricted' ? question.id : undefined}
            required={question.required}
            toolparamdescription={questionName ? paramDescription(question) : undefined}
            onchange={(event) => (selectedChoices[question.id] = event.currentTarget.value)}
          >
            <option value="">Choose one</option>
            {#each choices as choice (choice.id)}
              <option value={choice.id}>{choice.label}{choice.description ? ` — ${choice.description}` : ''}</option>
            {/each}
          </select>
        </PbField>
      {:else}
        <fieldset class="m-0 min-w-0 border-0 p-0">
          <legend class="text-sm font-semibold text-ink">
            {question.label}
            {#if question.required}<span> (required)</span>{/if}
          </legend>
          {#if fieldHint(question)}
            <p class="mt-1 mb-0 text-sm leading-normal text-muted">{fieldHint(question)}</p>
          {/if}
          <div class="mt-3 divide-y divide-line overflow-hidden rounded-xs border border-line-strong bg-surface">
            {#each choices as choice (choice.id)}
              <PbField
                variant="choice"
                label={choice.label}
                description={choice.description}
                class="px-3 py-2.5 hover:bg-subtle focus-within:bg-subtle"
              >
                <input
                  type="radio"
                  name={questionName}
                  data-question-id={question.sensitivity === 'restricted' ? question.id : undefined}
                  value={choice.id}
                  required={question.required}
                  toolparamdescription={questionName ? paramDescription(question) : undefined}
                  onchange={() => (selectedChoices[question.id] = choice.id)}
                />
              </PbField>
            {/each}
          </div>
        </fieldset>
      {/if}

      {@const selectedChoice = choices.find((choice) => choice.id === selectedChoices[question.id])}
      {#if selectedChoice?.followup}
        <PbField label="Additional detail" hint="Add the detail requested by this choice.">
          <input
            type="text"
            name={questionName ? `${question.id}${choiceFollowupSuffix}` : undefined}
            data-question-id={questionName ? undefined : `${question.id}${choiceFollowupSuffix}`}
            placeholder={selectedChoice.followup.placeholder ?? ''}
            toolparamdescription={questionName ? `Additional text for ${question.label}.` : undefined}
          />
        </PbField>
      {/if}
    {:else}
      {@const questionName = fieldName(question)}
      {@const placeholder = question.input.placeholder ?? question.example ?? ''}
      <PbField
        label={`${question.label}${question.required ? ' (required)' : ''}`}
        hint={fieldHint(question)}
      >
        <input
          type="text"
          name={questionName}
          data-question-id={question.sensitivity === 'restricted' ? question.id : undefined}
          required={question.required}
          placeholder={placeholder}
          autocomplete={question.sensitivity === 'restricted' ? 'off' : undefined}
          toolparamdescription={questionName ? paramDescription(question) : undefined}
        />
      </PbField>
    {/if}
  {/each}

  <div class="border-t border-line pt-5">
    <PbField
      label="Additional details"
      hint="Anything else JooVoice should know before calling. Optional."
    >
      <textarea
        name="additionalDetails"
        rows="4"
        maxlength="2000"
        placeholder="Preferences, backup choices, pronunciations, or anything to avoid…"
        toolparamdescription="Any extra context JooVoice should use for this call."
      ></textarea>
    </PbField>
  </div>

  <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
    <PbButton type="submit" size="md" disabled={busy}>{busy ? 'Sending…' : 'Send answers'}</PbButton>
    {#if request.canContinueWithoutOptional}
      <small class="text-sm leading-normal text-muted">Optional fields can stay empty.</small>
    {/if}
  </div>
</form>

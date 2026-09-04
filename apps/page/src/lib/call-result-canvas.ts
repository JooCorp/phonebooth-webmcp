import type {
  CallResultContentState,
  CallResultPresentationField,
  CallResultPresentationNotes,
  CallResultPresentationRecording,
  CallResultPresentationSection,
  CallResultPresentationTranscript,
  CallResultPresentationTranscriptLine,
  StatusObject,
} from '$lib/types.ts';
import { callVerdictPresentation } from '$lib/call-verdict.ts';

export type CallResultTone = 'success' | 'partial' | 'failure';

export type CallResultField = CallResultPresentationField;
export type CallResultNotes = CallResultPresentationNotes;
export type CallResultSection = CallResultPresentationSection;
export type CallResultRecording = CallResultPresentationRecording;
export type CallResultTranscriptLine = CallResultPresentationTranscriptLine;
export type CallResultTranscript = CallResultPresentationTranscript;

export type CallResultReceipt = {
  label?: string;
  title?: string;
  fields: readonly CallResultField[];
};

export type CallResultCanvasState = {
  outcome: {
    tone: CallResultTone;
    label: string;
    headline: string;
    summary?: string;
    metadata?: readonly string[];
  };
  sections?: readonly CallResultSection[];
  receipt?: CallResultReceipt;
  recording?: CallResultRecording;
  transcript?: CallResultTranscript;
  actions?: {
    canCreateNewCall?: boolean;
  };
  footerNote?: string;
};

export type CallResultCanvasOptions = {
  canCreateNewCall?: boolean;
  locale?: string;
};

function hasText(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function hasContent(state: CallResultContentState): boolean {
  return state === 'partial' || state === 'filled';
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const ids = new Set<string>();
  return items.filter((item) => {
    if (!hasText(item.id) || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

export function visibleResultFields(fields: readonly CallResultField[] | undefined): CallResultField[] {
  return uniqueById((fields ?? []).filter((field) => hasText(field.label) && hasText(field.value)));
}

export function visibleResultNotes(notes: CallResultNotes | undefined): CallResultNotes | undefined {
  if (!notes || !hasText(notes.label)) return undefined;
  const items = notes.items.filter(hasText);
  return items.length > 0 ? { ...notes, items } : undefined;
}

export function visibleResultSections(
  sections: readonly CallResultSection[] | undefined,
): CallResultSection[] {
  return uniqueById(
    (sections ?? [])
      .filter((section) => hasContent(section.state))
      .map((section) => ({
        ...section,
        fields: visibleResultFields(section.fields),
        notes: visibleResultNotes(section.notes),
      }))
      .filter(
        (section) =>
          hasText(section.title) &&
          (hasText(section.description) || section.fields.length > 0 || Boolean(section.notes)),
      ),
  );
}

export function visibleMetadata(metadata: readonly string[] | undefined): string[] {
  return (metadata ?? []).filter(hasText);
}

export function visibleTranscriptLines(
  transcript: CallResultTranscript | undefined,
): CallResultTranscriptLine[] {
  if (!transcript || !hasContent(transcript.state)) return [];
  return uniqueById(
    transcript.lines.filter((line) => hasText(line.speaker) && hasText(line.text)),
  );
}

export function safeDownloadUrl(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (/^\/(?!\/)/.test(candidate)) return candidate;

  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:') return candidate;
    if (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1')
    ) {
      return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hr`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (remainder > 0 || parts.length === 0) parts.push(`${remainder} sec`);
  return parts.join(' ');
}

export function formatCompletedAt(value: string, locale?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}

function humanizeEndedBecause(value: string): string {
  if (value === 'completed') return 'Normally';
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}` : 'Unknown';
}

function factId(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `fact-${slug || index + 1}-${index + 1}`;
}

function fallbackSections(status: StatusObject): CallResultSection[] {
  const facts = status.result?.facts ?? [];
  if (facts.length === 0) return [];
  return [
    {
      id: 'reported-details',
      state: 'filled',
      label: 'Reported on the call',
      title: 'What the call established',
      description: 'These details were reported during the conversation.',
      fields: facts.map((fact, index) => ({
        id: factId(fact.label, index),
        label: fact.label,
        value: fact.value,
      })),
    },
  ];
}

export function callResultCanvasFromStatus(
  status: StatusObject,
  options: CallResultCanvasOptions = {},
): CallResultCanvasState | undefined {
  const result = status.result;
  if (!result) return undefined;

  const presentation =
    result.presentation?.schemaVersion === 'call-result-presentation-v1'
      ? result.presentation
      : undefined;
  const sections = presentation?.sections ?? fallbackSections(status);
  const visibleSections = visibleResultSections(sections);
  const completedAt = formatCompletedAt(status.updatedAt, options.locale);
  const duration = formatDuration(result.durationSeconds);
  const verdict = callVerdictPresentation(status);
  const tone: CallResultTone = verdict?.state === 'succeeded'
    ? 'success'
    : verdict?.state === 'pending' || verdict?.state === 'undetermined' || visibleSections.length > 0
      ? 'partial'
      : 'failure';
  const recordingUrl =
    presentation?.recording && hasContent(presentation.recording.state)
      ? safeDownloadUrl(presentation.recording.downloadUrl)
      : undefined;
  const transcript =
    presentation?.transcript && visibleTranscriptLines(presentation.transcript).length > 0
      ? presentation.transcript
      : undefined;

  return {
    outcome: {
      tone,
      label:
        presentation?.outcomeLabel?.trim() ||
        verdict?.label ||
        'Call complete',
      headline:
        presentation?.headline?.trim() ||
        verdict?.headline ||
        'The call has finished.',
      summary: verdict?.detail || result.summary,
      metadata: [`Completed ${completedAt}`, duration],
    },
    sections,
    receipt: {
      label: 'Call receipt',
      title: 'Your agent made this call',
      fields: [
        { id: 'called', label: 'Called', value: status.calleeAlias },
        { id: 'completed', label: 'Completed', value: completedAt },
        { id: 'duration', label: 'Duration', value: duration },
        { id: 'ended', label: 'Ended', value: humanizeEndedBecause(result.endedBecause) },
      ],
    },
    ...(presentation?.recording && recordingUrl
      ? { recording: { ...presentation.recording, downloadUrl: recordingUrl } }
      : {}),
    ...(transcript ? { transcript } : {}),
    actions: { canCreateNewCall: Boolean(options.canCreateNewCall) },
    ...(presentation?.footerNote?.trim() ? { footerNote: presentation.footerNote } : {}),
  };
}

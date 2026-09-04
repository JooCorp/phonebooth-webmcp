import { describe, expect, test } from 'bun:test';
import {
  callResultCanvasFromStatus,
  safeDownloadUrl,
  visibleMetadata,
  visibleResultSections,
  visibleTranscriptLines,
} from './call-result-canvas.ts';
import type { StatusObject } from './types.ts';

function doneStatus(): StatusObject {
  return {
    callRequestId: 'cr_resulttest',
    status: 'done',
    meaning: 'The call ended.',
    sayToOwner: 'The result is ready.',
    next: [],
    request: 'Ask about a repair.',
    calleeAlias: 'Repair shop',
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:02:04.000Z',
    result: {
      objectiveSucceeded: true,
      summary: 'The shop can repair it.',
      facts: [
        { label: 'Estimated total', value: '$185–$220' },
        { label: 'Turnaround', value: 'Two business days' },
      ],
      endedBecause: 'completed',
      durationSeconds: 124,
      untrustedContent: true,
    },
  };
}

describe('call result canvas projection', () => {
  test('keeps arbitrary MCP labels and removes empty fields and sections', () => {
    const sections = visibleResultSections([
      {
        id: 'quote',
        state: 'filled',
        title: 'What the repair shop quoted',
        fields: [
          { id: 'price', label: 'Estimated total', value: '$185–$220' },
          { id: 'empty', label: 'Appointment time', value: '   ' },
          { id: 'turnaround', label: 'Turnaround', value: 'Two business days' },
        ],
      },
      {
        id: 'information',
        state: 'partial',
        title: 'Additional information',
        notes: { label: 'What to bring', items: ['Photo ID', ' ', 'The original receipt'] },
      },
      {
        id: 'empty',
        state: 'empty',
        title: 'Unused section',
        description: 'Stale content must not make an empty MCP section visible.',
        fields: [{ id: 'stale', label: 'Stale', value: 'Do not render' }],
      },
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0]?.fields).toEqual([
      { id: 'price', label: 'Estimated total', value: '$185–$220' },
      { id: 'turnaround', label: 'Turnaround', value: 'Two business days' },
    ]);
    expect(sections[1]?.notes?.items).toEqual(['Photo ID', 'The original receipt']);
  });

  test('omits blank metadata and transcript lines', () => {
    expect(visibleMetadata(['Completed today', '', '  ', '2 min 04 sec'])).toEqual([
      'Completed today',
      '2 min 04 sec',
    ]);
    expect(
      visibleTranscriptLines({
        state: 'filled',
        lines: [
          { id: 'one', speaker: 'Business', text: 'The order is ready.' },
          { id: 'two', speaker: '', text: 'Missing speaker' },
          { id: 'three', speaker: 'Agent', text: ' ' },
        ],
      }),
    ).toEqual([{ id: 'one', speaker: 'Business', text: 'The order is ready.' }]);
    expect(
      visibleTranscriptLines({
        state: 'empty',
        lines: [{ id: 'stale', speaker: 'Business', text: 'Do not render' }],
      }),
    ).toEqual([]);
  });

  test('adapts the existing MCP facts when no presentation projection is returned', () => {
    const canvas = callResultCanvasFromStatus(doneStatus(), { canCreateNewCall: true });

    expect(canvas?.outcome.tone).toBe('success');
    expect(canvas?.outcome.summary).toBe('The shop can repair it.');
    expect(canvas?.outcome.metadata?.at(-1)).toBe('2 min 4 sec');
    expect(canvas?.receipt?.fields.find((field) => field.id === 'called')?.value).toBe('Repair shop');
    expect(visibleResultSections(canvas?.sections)[0]?.fields?.map((field) => field.label)).toEqual([
      'Estimated total',
      'Turnaround',
    ]);
    expect(canvas?.actions?.canCreateNewCall).toBe(true);
  });

  test('lets the MCP replace fallback facts with stateful, call-specific sections', () => {
    const status = doneStatus();
    status.result!.presentation = {
      schemaVersion: 'call-result-presentation-v1',
      headline: 'The shop has an opening.',
      sections: [
        {
          id: 'availability',
          state: 'partial',
          title: 'Available appointment',
          fields: [{ id: 'day', label: 'Day', value: 'Friday' }],
        },
        {
          id: 'party-size',
          state: 'empty',
          title: 'Party size',
          fields: [{ id: 'party', label: 'Party', value: 'Not relevant' }],
        },
      ],
    };

    const canvas = callResultCanvasFromStatus(status);
    expect(canvas?.outcome.headline).toBe('The shop has an opening.');
    expect(visibleResultSections(canvas?.sections).map((section) => section.id)).toEqual([
      'availability',
    ]);
  });

  test('accepts same-origin and HTTPS recordings but rejects active or insecure remote URLs', () => {
    expect(safeDownloadUrl('/api/calls/one/recording')).toBe('/api/calls/one/recording');
    expect(safeDownloadUrl('https://media.example.test/one.m4a')).toBe(
      'https://media.example.test/one.m4a',
    );
    expect(safeDownloadUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeDownloadUrl('http://media.example.test/one.m4a')).toBeUndefined();
  });
});

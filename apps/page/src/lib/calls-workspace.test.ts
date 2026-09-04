import { describe, expect, test } from 'bun:test';
import {
  formatElapsed,
  groupRequests,
  requestPresentation,
  requestStatusLabel,
  selectFocusedRequest,
} from './calls-workspace.ts';
import type { CallRequestStatus, StatusObject } from './types.ts';

function request(status: CallRequestStatus, id = `cr_${status}`, updatedAt = '2026-09-04T10:00:00.000Z'): StatusObject {
  return {
    callRequestId: id,
    status,
    meaning: `${status} meaning`,
    sayToOwner: `${status} owner copy`,
    next: [],
    request: 'Book a table for two.',
    calleeAlias: '+65…12',
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('calls workspace presentation', () => {
  test('maps every MCP request status to deliberate owner-facing copy', () => {
    const statuses: CallRequestStatus[] = [
      'thinking',
      'needs_answers',
      'ready_for_review',
      'queued',
      'calling',
      'done',
      'not_placed',
      'cancelled',
    ];

    for (const status of statuses) {
      const presentation = requestPresentation(request(status));
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.title.length).toBeGreaterThan(0);
      expect(presentation.description.length).toBeGreaterThan(0);
      expect(requestStatusLabel(status).length).toBeGreaterThan(0);
    }
  });

  test('uses live phase, human approval, window, result, and failure details when present', () => {
    expect(requestPresentation({ ...request('calling'), live: { phase: 'on_hold', seconds: 18 } }).description).toContain('hold');
    expect(requestPresentation({ ...request('queued'), callNow: true }).tone).toBe('human');
    expect(requestPresentation({ ...request('queued'), window: { text: 'Calling tomorrow morning.' } }).description).toBe('Calling tomorrow morning.');
    expect(
      requestPresentation({
        ...request('done'),
        result: {
          objectiveSucceeded: true,
          summary: 'The table is booked.',
          facts: [],
          endedBecause: 'completed',
          durationSeconds: 42,
          untrustedContent: true,
        },
      }).description,
    ).toBe('The table is booked.');
    expect(requestPresentation({ ...request('not_placed'), reason: { code: 'not_answered', text: 'No one answered.' } }).description).toBe('No one answered.');
  });

  test('presents ready_for_review as a non-terminal human handoff', () => {
    expect(requestPresentation(request('ready_for_review'))).toEqual({
      label: 'Ready for you',
      title: 'This call is ready to place.',
      description: 'JooVoice will start when you press the button.',
      tone: 'human',
    });
    expect(requestStatusLabel('ready_for_review')).toBe('Ready for you');
    expect(groupRequests([request('ready_for_review')]).active).toHaveLength(1);
  });

  test('keeps the Calls home list-first and opens only a valid URL selection', () => {
    const completed = request('done', 'cr_done', '2026-09-04T12:00:00.000Z');
    const thinking = request('thinking', 'cr_thinking', '2026-09-04T11:00:00.000Z');
    const queued = request('queued', 'cr_queued', '2026-09-04T10:00:00.000Z');
    const requests = [completed, queued, thinking];

    expect(selectFocusedRequest(requests)).toBeUndefined();
    expect(selectFocusedRequest(requests, 'cr_done')?.callRequestId).toBe('cr_done');
    expect(selectFocusedRequest(requests, 'missing')).toBeUndefined();
  });

  test('pins active calls ahead of a separately ordered recent history', () => {
    const done = request('done', 'cr_done', '2026-09-04T12:00:00.000Z');
    const thinking = request('thinking', 'cr_thinking', '2026-09-04T11:00:00.000Z');
    const cancelled = request('cancelled', 'cr_cancelled', '2026-09-04T09:00:00.000Z');
    const calling = request('calling', 'cr_calling', '2026-09-04T13:00:00.000Z');

    const groups = groupRequests([done, thinking, cancelled, calling]);
    expect(groups.active.map((entry) => entry.callRequestId)).toEqual(['cr_calling', 'cr_thinking']);
    expect(groups.recent.map((entry) => entry.callRequestId)).toEqual(['cr_done', 'cr_cancelled']);
  });

  test('formats live elapsed time defensively', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65.9)).toBe('1:05');
    expect(formatElapsed(-2)).toBe('0:00');
    expect(formatElapsed(Number.NaN)).toBe('0:00');
  });
});

import { describe, expect, test } from 'bun:test';
import { callVerdictPresentation } from './call-verdict.ts';
import type { StatusObject } from './types.ts';

describe('call verdict presentation', () => {
  test.each([
    [true, 'succeeded', 'Objective reached'],
    [false, 'not_succeeded', 'Objective not reached'],
  ] as const)('keeps a detected %s verdict distinct', (objectiveSucceeded, state, label) => {
    expect(callVerdictPresentation(done(objectiveSucceeded))).toMatchObject({ state, label });
  });

  test('shows pending while the terminal result still requests refreshes', () => {
    expect(callVerdictPresentation(done(null, 1))).toMatchObject({
      state: 'pending',
      label: 'Verdict being prepared',
    });
  });

  test('renders a settled null as no verdict, never as failure', () => {
    expect(callVerdictPresentation(done(null))).toMatchObject({
      state: 'undetermined',
      label: 'No verdict detected',
    });
  });
});

function done(objectiveSucceeded: boolean | null, checkAfterSeconds?: number): StatusObject {
  return {
    callRequestId: 'cr_verdict_test',
    status: 'done',
    meaning: 'The call ended.',
    sayToOwner: 'The result is ready.',
    next: checkAfterSeconds === undefined
      ? []
      : [{ tool: 'check_call_request', args: {}, after: 'checkAfterSeconds' }],
    ...(checkAfterSeconds === undefined ? {} : { checkAfterSeconds }),
    request: 'Confirm the booking.',
    calleeAlias: 'Restaurant',
    createdAt: '2026-09-04T08:00:00.000Z',
    updatedAt: '2026-09-04T08:01:00.000Z',
    result: {
      objectiveSucceeded,
      summary: 'The call ended.',
      facts: [],
      endedBecause: 'completed',
      durationSeconds: 42,
      untrustedContent: true,
    },
  };
}

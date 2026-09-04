import { describe, expect, test } from 'bun:test';
import { fromCallRequest } from './joovoice-shape.ts';

const callRequestFixture = {
  schemaVersion: 'joovoice-call-request-v1',
  callRequestId: 'cr_public_test_001',
  revision: 1,
  status: 'needs_answers',
  meaning: 'We have questions before we can call.',
  sayToOwner: 'JooVoice needs one thing from you: name for the booking.',
  request: 'Ask Example Bistro when its kitchen closes.',
  callee: { display: '+1 •••• 0123' },
  createdAt: '2026-09-04T08:00:00.000Z',
  updatedAt: '2026-09-04T08:00:00.000Z',
  questionSet: {
    id: 'qs_public_test_001',
    questions: [
      {
        id: 'q_public_test_001',
        label: 'Name to use on the call',
        required: true,
        whyWeAsk: 'The business may ask who is calling.',
        input: { kind: 'text', placeholder: 'Name' },
        example: 'Example User',
      },
      {
        id: 'q_public_test_002',
        label: 'Seating preference',
        required: false,
        whyWeAsk: 'A preference helps the restaurant find a suitable table.',
        input: {
          kind: 'single_choice',
          allowOther: true,
          allowAdditionalText: true,
          choices: [
            { id: 'ch_public_test_001', label: 'Inside' },
            { id: 'ch_public_test_002', label: 'Outside', description: 'A table on the patio.' },
          ],
        },
      },
    ],
    canContinueWithoutOptional: false,
  },
  availableActions: [{ kind: 'answer_questions', questionSetId: 'qs_public_test_001' }],
};

const readyForReviewFixture = {
  ...callRequestFixture,
  revision: 2,
  status: 'ready_for_review',
  meaning: 'The call is ready for your review.',
  sayToOwner: 'Review the details in Phonebooth, then place the call when you are ready.',
  updatedAt: '2026-09-04T08:03:00.000Z',
  questionSet: undefined,
  availableActions: [{ kind: 'review_and_call', revision: 2 }],
};

const settledVerdictFixture = {
  ...callRequestFixture,
  revision: 5,
  status: 'done',
  meaning: 'The call ended. Result attached.',
  sayToOwner: 'Done — the restaurant confirmed the booking.',
  updatedAt: '2026-09-04T08:05:00.000Z',
  questionSet: undefined,
  result: {
    objectiveSucceeded: true,
    summary: 'The restaurant confirmed the booking.',
    facts: [{ label: 'Booking', value: 'Confirmed for Friday at 7 pm' }],
    endedBecause: 'The call ended normally.',
    durationSeconds: 42,
    untrustedContent: true as const,
  },
  availableActions: [],
};

describe('JooVoice call-request shape adapter', () => {
  test('maps a real question shape into the page status object', () => {
    const mapped = fromCallRequest(callRequestFixture);

    expect(mapped).toMatchObject({
      callRequestId: 'cr_public_test_001',
      status: 'needs_answers',
      calleeAlias: '+1 •••• 0123',
      questionSetId: 'qs_public_test_001',
      canContinueWithoutOptional: false,
      next: [{
        tool: 'answer_call_questions',
        args: {
          callRequestId: 'cr_public_test_001',
          questionSetId: 'qs_public_test_001',
        },
      }],
    });
    expect(mapped?.questions).toEqual([
      {
        id: 'q_public_test_001',
        label: 'Name to use on the call',
        required: true,
        whyWeAsk: 'The business may ask who is calling.',
        input: { kind: 'text', placeholder: 'Name' },
        example: 'Example User',
      },
      {
        id: 'q_public_test_002',
        label: 'Seating preference',
        required: false,
        whyWeAsk: 'A preference helps the restaurant find a suitable table.',
        input: {
          kind: 'single_choice',
          choices: [
            { id: 'ch_public_test_001', label: 'Inside' },
            { id: 'ch_public_test_002', label: 'Outside', description: 'A table on the patio.' },
          ],
        },
      },
    ]);
  });

  test('maps polling and human review actions without inventing an agent placement tool', () => {
    const queued = fromCallRequest({
      ...callRequestFixture,
      status: 'queued',
      questionSet: undefined,
      availableActions: [{ kind: 'check_status', afterSeconds: 30 }],
    });
    const ready = fromCallRequest(readyForReviewFixture);

    expect(queued).toMatchObject({
      checkAfterSeconds: 30,
      next: [{
        tool: 'check_call_request',
        args: { callRequestId: 'cr_public_test_001' },
        after: 'checkAfterSeconds',
      }],
    });
    expect(ready).toMatchObject({
      status: 'ready_for_review',
      callNow: true,
      next: [{
        tool: 'place_call_request',
        args: { callRequestId: 'cr_public_test_001', revision: 2 },
      }],
      revision: 2,
    });
  });

  test('maps a settled verdict and leaves simulator-shaped values untouched', () => {
    const settled = fromCallRequest(settledVerdictFixture);
    expect(settled?.result).toEqual(settledVerdictFixture.result);

    const simulator = { ...settled!, calleeAlias: '+65…12' };
    expect(fromCallRequest(simulator)).toBe(simulator);
    expect(fromCallRequest({ callRequestId: 'cr_missing_callee' })).toBeNull();
  });

  test('maps only the server-owned retry capability for an unanswered call', () => {
    const mapped = fromCallRequest({
      ...callRequestFixture,
      revision: 8,
      status: 'not_placed',
      questionSet: undefined,
      reason: { code: 'not_answered', text: 'The call was not answered.' },
      attemptSummary: { count: 1 },
      availableActions: [{ kind: 'retry_call', reason: 'not_answered', revision: 8 }],
    });

    expect(mapped).toMatchObject({
      status: 'not_placed',
      revision: 8,
      retryNow: true,
      attemptSummary: { count: 1 },
      next: [{
        tool: 'retry_call_request',
        args: { callRequestId: 'cr_public_test_001', revision: 8 },
      }],
    });

    const unavailable = fromCallRequest({
      ...callRequestFixture,
      revision: 9,
      status: 'not_placed',
      questionSet: undefined,
      reason: { code: 'engine_unavailable', text: 'The call could not be placed.' },
      availableActions: [],
    });
    expect(unavailable?.retryNow).toBeUndefined();
    expect(unavailable?.next).toEqual([]);
  });
});

import { describe, expect, test } from 'bun:test';
import { CallActionApiError, createCallActionApi } from './call-action-api.ts';

describe('hosted human call actions', () => {
  test.each([
    ['place_call_request', 'review-and-call'],
    ['retry_call_request', 'retry'],
  ] as const)('uses the authenticated product route for %s', async (action, suffix) => {
    let captured: { input: RequestInfo | URL; init?: RequestInit } | undefined;
    const api = createCallActionApi({
      apiBaseUrl: 'https://api.example.test/',
      token: () => 'test-session-token',
      fetch: async (input, init) => {
        captured = { input, init };
        return Response.json({
          schemaVersion: 'joovoice-call-request-v1',
          callRequestId: 'cr_abcdef12',
        });
      },
    });

    await api.act(action, 'cr_abcdef12', 7, 'action-12345678');

    expect(String(captured?.input)).toBe(`https://api.example.test/v1/call-requests/cr_abcdef12/${suffix}`);
    expect(captured?.init?.method).toBe('POST');
    expect(new Headers(captured?.init?.headers).get('Authorization')).toBe('Bearer test-session-token');
    expect(new Headers(captured?.init?.headers).get('Idempotency-Key')).toBe('action-12345678');
    expect(captured?.init?.body).toBe(JSON.stringify({ revision: 7 }));
  });

  test('preserves the server guide and current state on a stale review', async () => {
    const api = createCallActionApi({
      apiBaseUrl: 'https://api.example.test',
      token: () => 'test-session-token',
      fetch: async () => Response.json({
        error: {
          kind: 'review_changed',
          headline: 'The call changed before it was placed.',
          fix: 'Review the current call and try again.',
          current: { callRequestId: 'cr_abcdef12' },
        },
      }, { status: 409 }),
    });

    try {
      await api.act('place_call_request', 'cr_abcdef12', 7, 'action-12345678');
      throw new Error('expected the action to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(CallActionApiError);
      expect((error as CallActionApiError).toGuide()).toMatchObject({
        kind: 'not_allowed_right_now',
        headline: 'The call changed before it was placed.',
      });
      expect((error as CallActionApiError).current).toEqual({ callRequestId: 'cr_abcdef12' });
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { createWelcomeCallApi, WelcomeCallApiError } from './welcome-call-api.ts';

describe('JooVoice welcome-call JSON client', () => {
  test('uses the session bearer for read, request, and acknowledgement routes', async () => {
    const seen: Array<{ url: string; method: string; authorization: string | null; body: unknown }> = [];
    const api = createWelcomeCallApi({
      apiBaseUrl: 'https://api.joovoice.test/',
      token: () => 'session-secret',
      fetch: async (input, init) => {
        seen.push({
          url: String(input),
          method: init?.method ?? 'GET',
          authorization: new Headers(init?.headers).get('authorization'),
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        return Response.json({
          welcomeCall: { status: seen.length === 1 ? 'required' : 'requested', phoneAlias: null, acknowledged: false },
          checkAfterSeconds: 1,
        });
      },
    });

    await api.read();
    await api.request('+14155550123');
    await api.acknowledge();

    expect(seen).toEqual([
      {
        url: 'https://api.joovoice.test/v1/account/welcome-call',
        method: 'GET',
        authorization: 'Bearer session-secret',
        body: null,
      },
      {
        url: 'https://api.joovoice.test/v1/account/welcome-call',
        method: 'POST',
        authorization: 'Bearer session-secret',
        body: { phone: '+14155550123' },
      },
      {
        url: 'https://api.joovoice.test/v1/account/welcome-call/acknowledge',
        method: 'POST',
        authorization: 'Bearer session-secret',
        body: null,
      },
    ]);
  });

  test('preserves a public not-placed reason and classifies friendly exhaustion', async () => {
    let response = Response.json({
      welcomeCall: {
        status: 'required',
        phoneAlias: '+1 •••• 0123',
        acknowledged: false,
        reason: { code: 'not_answered', text: 'The number did not answer.' },
      },
      checkAfterSeconds: 1,
    });
    const api = createWelcomeCallApi({
      apiBaseUrl: 'https://api.joovoice.test',
      token: () => 'session-secret',
      fetch: async () => response,
    });

    expect((await api.read()).welcomeCall.reason?.text).toBe('The number did not answer.');

    response = Response.json({
      schemaVersion: 'joovoice-public-error-v1',
      code: 'welcome_call_exhausted',
      text: 'You can continue to Phonebooth.',
      next: [{ tool: 'acknowledge_welcome_call', args: {} }],
    }, { status: 409 });
    const error = await api.request('+14155550123').catch(cause => cause);
    expect(error).toBeInstanceOf(WelcomeCallApiError);
    expect((error as WelcomeCallApiError).isExhaustion).toBe(true);
    expect((error as Error).message).toBe('You can continue to Phonebooth.');
  });

  test('reports authentication challenges without confusing ordinary validation errors', async () => {
    const challenged: number[] = [];
    let status = 401;
    const api = createWelcomeCallApi({
      apiBaseUrl: 'https://api.joovoice.test',
      token: () => 'session-secret',
      onChallenge: value => challenged.push(value),
      fetch: async () => Response.json({
        schemaVersion: 'joovoice-public-error-v1',
        error: {
          kind: status === 401 ? 'authentication_required' : 'fix_the_request',
          headline: status === 401 ? 'Sign in.' : 'That phone number is not valid.',
          fix: status === 401 ? 'Sign in again.' : 'Use E.164 format.',
          sayToOwner: status === 401 ? 'Please sign in.' : 'Fix the phone number.',
        },
      }, { status }),
    });

    const authenticationError = await api.read().catch(cause => cause) as WelcomeCallApiError;
    expect(authenticationError.toGuide()).toMatchObject({
      kind: 'owner_action_required',
      headline: 'Sign in.',
      fix: 'Sign in again.',
    });
    status = 400;
    const validationError = await api.request('+14155550123').catch(cause => cause) as WelcomeCallApiError;
    expect(validationError.toGuide()).toMatchObject({
      kind: 'fix_the_request',
      headline: 'That phone number is not valid.',
      fix: 'Use E.164 format.',
    });
    expect(challenged).toEqual([401]);
  });
});

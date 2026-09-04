import { describe, expect, test } from 'bun:test';
import { resolveRootScreen } from './root-screen.ts';
import type { AccountObject, WelcomeCallStatus } from './types.ts';

function account(status: WelcomeCallStatus, loggedIn = true): AccountObject {
  return {
    loggedIn,
    accountState: 'active',
    ...(loggedIn ? { displayName: 'Demo User' } : {}),
    welcomeCall: { status, phoneAlias: null, acknowledged: false },
    blockers: [],
    phone: { verified: true, alias: null, reportBackConsented: false },
    urls: { web: 'https://joovoice.com', dashboard: 'https://booth.joovoice.com', connect: 'https://joovoice.com/agents' },
    sayToOwner: 'Ready.',
    next: [],
    docs: [],
  };
}

describe('root screen resolution', () => {
  test('keeps signed-out and pre-account sessions at the front door', () => {
    expect(resolveRootScreen(null)).toBe('first_visit');
    expect(resolveRootScreen(account('required', false))).toBe('first_visit');
  });

  test('shows the welcome screen only when the MCP account projection advertises a welcome call', () => {
    expect(resolveRootScreen(account('required'))).toBe('welcome_call');
    expect(resolveRootScreen(account('requested'))).toBe('welcome_call');
    expect(resolveRootScreen(account('calling'))).toBe('welcome_call');
    expect(resolveRootScreen(account('complete'))).toBe('welcome_call');
    expect(
      resolveRootScreen({
        ...account('complete'),
        welcomeCall: { status: 'complete', phoneAlias: '+65…12', acknowledged: true },
      }),
    ).toBe('welcome_call');
  });

  test('goes straight to Calls when the MCP account projection omits the welcome capability', () => {
    expect(resolveRootScreen({ ...account('required'), welcomeCall: undefined })).toBe('workspace');
  });

  test('moves a signed-in session to the workspace only after local dismissal', () => {
    expect(resolveRootScreen(account('required'), true)).toBe('workspace');
    expect(resolveRootScreen(account('complete'), true)).toBe('workspace');
    expect(resolveRootScreen(account('required', false), true)).toBe('first_visit');
  });
});

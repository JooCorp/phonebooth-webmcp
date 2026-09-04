import type { AccountObject } from './types.ts';

export type RootScreen = 'first_visit' | 'welcome_call' | 'workspace';

export function resolveRootScreen(account: AccountObject | null, welcomeDismissedForSession = false): RootScreen {
  if (!account?.loggedIn) return 'first_visit';
  // The account resource is the server-owned welcome capability. An absent
  // projection means the current account/session has no welcome call to make;
  // the page must not invent an onboarding screen of its own.
  if (!account.welcomeCall) return 'workspace';
  return welcomeDismissedForSession ? 'workspace' : 'welcome_call';
}

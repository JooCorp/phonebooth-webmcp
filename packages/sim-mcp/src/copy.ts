import type { BlockerCode, CallRequestStatus, ReasonCode } from './types.ts';

export const meaning: Record<CallRequestStatus, string> = {
  thinking: 'Placeholder meaning for a request being prepared.',
  needs_answers: 'Placeholder meaning for a request waiting on answers.',
  queued: 'Placeholder meaning for a request waiting to be placed.',
  calling: 'Placeholder meaning for a call in progress.',
  done: 'Placeholder meaning for a finished call.',
  not_placed: 'Placeholder meaning for a call that was not placed.',
  cancelled: 'Placeholder meaning for a cancelled request.',
};

export const sayToOwner: Record<CallRequestStatus, string> = {
  thinking: 'Placeholder line for the owner while the request is prepared.',
  needs_answers: 'Placeholder line for the owner about the open questions.',
  queued: 'Placeholder line for the owner while the request waits.',
  calling: 'Placeholder line for the owner during the call.',
  done: 'Placeholder line for the owner about the result.',
  not_placed: 'Placeholder line for the owner about a call that was not placed.',
  cancelled: 'Placeholder line for the owner about a cancelled request.',
};

export const aside: Partial<Record<CallRequestStatus, string>> = {
  thinking: 'Placeholder aside one.',
  queued: 'Placeholder aside two.',
  calling: 'Placeholder aside three.',
  done: 'Placeholder aside four.',
};

export const windowText = {
  scheduled: 'Placeholder window text for a request that will be placed on its own.',
  awaitingPlace: 'Placeholder window text for a request waiting on the place button.',
};

export const questionCopy = {
  requiredLabel: 'Whose name should the booking be under?',
  requiredWhy: 'Placeholder explanation for the required question.',
  requiredExample: 'Placeholder example answer.',
  requiredPrefill: 'Placeholder prefill hint.',
  optionalLabel: 'Is a later time acceptable?',
  optionalWhy: 'Placeholder explanation for the optional question.',
  optionalChoices: [
    { id: 'ch_a', label: 'Placeholder choice A', description: 'Placeholder description A.' },
    { id: 'ch_b', label: 'Placeholder choice B', description: 'Placeholder description B.' },
  ],
};

export const resultCopy = {
  summary: 'Placeholder summary of what the other side said on the simulated call.',
  facts: [
    { label: 'Placeholder fact one', value: 'Placeholder value one' },
    { label: 'Placeholder fact two', value: 'Placeholder value two' },
  ],
  endedBecause: 'completed',
  outcomeLabel: 'Objective reached',
  headline: 'The simulated call is complete.',
  sectionLabel: 'Reported on the call',
  sectionTitle: 'What the call established',
  sectionDescription: 'These details were reported during the simulated conversation.',
};

export const reasonText: Record<ReasonCode, string> = {
  outside_calling_hours: 'Placeholder reason: outside calling hours.',
  unsupported_country: 'Placeholder reason: unsupported country.',
  rate_limited: 'Placeholder reason: rate limited.',
  do_not_call: 'Placeholder reason: do not call.',
  deadline_passed: 'Placeholder reason: deadline passed.',
  not_answered: 'Placeholder reason: not answered.',
  engine_unavailable: 'Placeholder reason: unavailable.',
};

export const accountCopy = {
  displayName: 'Placeholder Person',
  sayToOwnerWelcomeRequired:
    'You should REALLY try the welcome call. JooVoice has strict policies around calls, so this is how you validate your number. What number should we use? Include the country code.',
  sayToOwnerActive: 'Placeholder line for the owner about a ready account.',
  sayToOwnerSetup: 'Placeholder line for the owner about setup still missing.',
  sayToOwnerSuspended: 'Placeholder line for the owner about a suspended account.',
  sayToOwnerSignedOut: 'Placeholder line for the owner about signing in.',
  prefillSay: 'Placeholder line for the owner about prefilled setup answers.',
};

export const blockerText: Record<BlockerCode, string> = {
  profile_name_missing: 'Placeholder blocker text: name missing.',
  phone_unverified: 'Placeholder blocker text: phone unverified.',
  calling_consent_missing: 'Placeholder blocker text: calling consent missing.',
  no_calling_credit: 'Placeholder blocker text: no calling credit.',
  account_suspended: 'Placeholder blocker text: account suspended.',
  profile_sunset: 'Placeholder blocker text: profile ended.',
};

export const blockerPath: Record<BlockerCode, string> = {
  profile_name_missing: '/settings?section=profile',
  phone_unverified: '/settings?section=security&gate=phone',
  calling_consent_missing: '/settings?section=calling',
  no_calling_credit: '/settings?section=billing',
  account_suspended: '/settings',
  profile_sunset: '/settings',
};

export const guideCopy = {
  signedOut: {
    headline: 'Not signed in',
    fix: 'Placeholder fix for a signed-out caller.',
    say: 'Placeholder line for the owner about signing in.',
  },
  setupRequired: {
    headline: 'Setup still missing',
    fix: 'Placeholder fix for missing setup.',
    say: 'Placeholder line for the owner about missing setup.',
  },
  notFound: {
    headline: 'No such call request',
    fix: 'Placeholder fix for an unknown call request id.',
    say: 'Placeholder line for the owner about an unknown request.',
  },
  badRequest: {
    headline: 'The request needs a change',
    fix: 'Placeholder fix for an incomplete request.',
    say: 'Placeholder line for the owner about an incomplete request.',
  },
  notNow: {
    headline: 'Not possible right now',
    fix: 'Placeholder fix for an action the current state does not allow.',
    say: 'Placeholder line for the owner about the current state.',
  },
  questionsChanged: {
    headline: 'The questions changed',
    fix: 'Placeholder fix for a stale question set.',
    say: 'Placeholder line for the owner about changed questions.',
  },
  reportBackUnavailable: {
    headline: 'No verified number to call back',
    fix: 'Placeholder fix for a missing report-back number.',
    say: 'Placeholder line for the owner about the report-back number.',
  },
  missingAnswers: {
    headline: 'Required answers are missing',
    fix: 'Placeholder fix for missing required answers.',
    say: 'Placeholder line for the owner about missing answers.',
  },
};

export const docs: Record<string, { name: string; text: string }> = {
  'joovoice://docs/getting-started': {
    name: 'Getting started',
    text: 'Placeholder getting-started document.',
  },
  'joovoice://docs/staying-informed': {
    name: 'Staying informed',
    text: 'Placeholder staying-informed document.',
  },
};

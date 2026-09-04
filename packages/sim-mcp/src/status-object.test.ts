import { describe, expect, test } from 'bun:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { schemas } from './schemas.ts';
import { SimStore, script } from './store.ts';
import type { ErrorGuide, FeaturedActionsState, StatusObject } from './types.ts';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateStatus = ajv.compile(schemas.statusObject);
const validateAccount = ajv.compile(schemas.account);
const validateGuide = ajv.compile(schemas.errorGuide);
const validateList = ajv.compile(schemas.callRequestList);
const validatePrefill = ajv.compile(schemas.prefill);
const validateFeaturedActions = ajv.compile(schemas.featuredActions);

function expectValid(validate: ReturnType<typeof ajv.compile>, payload: unknown): void {
  const valid = validate(payload);
  if (!valid) throw new Error(JSON.stringify({ payload, errors: validate.errors }, null, 2));
  expect(valid).toBe(true);
}

function base() {
  return { request: 'Ask one thing', phone: '+6591234512', ownerTimezone: 'Asia/Singapore' };
}

function clock(start = Date.parse('2026-09-03T10:00:00.000Z')) {
  let now = start;
  return { now: () => now, advance: (seconds: number) => (now += seconds * 1000) };
}

function value<T>(outcome: { ok: true; value: T } | { ok: false; guide: ErrorGuide }): T {
  if (!outcome.ok) throw new Error(JSON.stringify(outcome.guide));
  return outcome.value;
}

function guideOf<T>(outcome: { ok: true; value: T } | { ok: false; guide: ErrorGuide }): ErrorGuide {
  if (outcome.ok) throw new Error('expected a guide');
  return outcome.guide;
}

describe('every simulated payload matches the contract schema', () => {
  test('optional featured actions stay server-defined and idempotent', () => {
    const payload: FeaturedActionsState = {
      schemaVersion: 'featured-actions-v1',
      revision: 4,
      eyebrow: 'Optional',
      title: 'A server-defined panel',
      description: 'Presentation comes from the service.',
      caution: 'Review before continuing.',
      cautionFlair: '(¬‿¬)',
      items: [
        {
          id: 'opaque-a',
          label: 'First option',
          flair: '>:3',
          allowance: { limit: 2, remaining: 2, label: '2 of 2 left' },
          available: true,
          statusText: 'Available.',
          actionLabel: 'Continue',
          fields: [{ id: 'phone', kind: 'phone', label: 'Phone', required: true }],
        },
        {
          id: 'opaque-b',
          label: 'Second option',
          available: true,
          statusText: 'Available.',
          actionLabel: 'Continue',
          allowance: { limit: 2, remaining: 2 },
        },
      ],
      footer: 'Service-defined footer.',
      sayToOwner: 'A featured action is available.',
    };
    const store = new SimStore({ featuredActions: payload });
    expectValid(validateFeaturedActions, value(store.checkFeaturedActions()));

    expect(guideOf(store.triggerFeaturedAction('opaque-a', {}, 4, 'inv-missing-field')).kind).toBe('fix_the_request');
    const triggered = value(store.triggerFeaturedAction('opaque-a', { phone: '+1 202 555 0101' }, 4, 'inv-feature-1'));
    expectValid(validateFeaturedActions, triggered);
    expect(triggered.items[0]?.allowance).toEqual({ limit: 2, remaining: 1, label: '1 of 2 left' });
    expect(triggered.items[0]?.available).toBe(true);
    expect(triggered.items[1]?.allowance).toEqual({ limit: 2, remaining: 2 });

    const replay = value(store.triggerFeaturedAction('opaque-a', { phone: '+1 202 555 0101' }, 4, 'inv-feature-1'));
    expect(replay.items[0]?.allowance?.remaining).toBe(1);
    const exhausted = value(store.triggerFeaturedAction('opaque-a', { phone: '+1 202 555 0101' }, 5, 'inv-feature-2'));
    expect(exhausted.items[0]?.allowance).toEqual({ limit: 2, remaining: 0, label: '0 of 2 left' });
    expect(exhausted.items[0]?.available).toBe(false);
    expect(exhausted.items[1]?.allowance?.remaining).toBe(2);
    expect(guideOf(store.triggerFeaturedAction('opaque-a', { phone: '+1 202 555 0101' }, 6, 'inv-feature-3')).kind).toBe('not_allowed_right_now');
  });

  test('a scheduled request through every state', () => {
    const time = clock();
    const store = new SimStore({ now: time.now });
    const seen: StatusObject[] = [];
    let capturedAdditionalDetails: string | undefined;
    store.onRequest(({ status, request }) => {
      seen.push(status);
      capturedAdditionalDetails = request.additionalDetails;
    });

    const created = value(store.create(base()));
    expectValid(validateStatus, created);
    expect(created.status).toBe('thinking');
    expect(created.whisper).toBeString();

    time.advance(script.thinkingSeconds);
    store.tick();
    const asking = value(store.check(created.callRequestId));
    expectValid(validateStatus, asking);
    expect(asking.status).toBe('needs_answers');
    expect(asking.questions?.filter((question) => question.required)).toHaveLength(1);
    expect(asking.questions?.filter((question) => !question.required)).toHaveLength(1);
    expect(asking.questions?.map((question) => [question.kind, question.sensitivity])).toEqual([
      ['text', 'sensitive'],
      ['choice', 'public'],
    ]);
    expect(asking.whisper).toBeUndefined();

    const tooDetailed = store.answer(
      created.callRequestId,
      asking.questionSetId!,
      [{ id: 'q_name', value: 'A name' }],
      undefined,
      'x'.repeat(2001),
    );
    expectValid(validateGuide, guideOf(tooDetailed));
    expect(value(store.check(created.callRequestId)).status).toBe('needs_answers');

    const partial = store.answer(created.callRequestId, asking.questionSetId!, [{ id: 'q_later', choiceId: 'ch_a' }]);
    expectValid(validateGuide, guideOf(partial));
    expect(value(store.check(created.callRequestId)).status).toBe('needs_answers');

    const queued = value(
      store.answer(
        created.callRequestId,
        asking.questionSetId!,
        [{ id: 'q_name', value: 'A name' }],
        undefined,
        '  Please ask for a quiet table.  ',
      ),
    );
    expectValid(validateStatus, queued);
    expect(queued.status).toBe('queued');
    expect(capturedAdditionalDetails).toBe('Please ask for a quiet table.');
    expect(queued.window?.notBefore).toBeString();
    expect(queued.checkAfterSeconds).toBe(script.queuedSeconds);

    time.advance(script.queuedSeconds);
    store.tick();
    for (const phase of script.phases) {
      const live = value(store.check(created.callRequestId));
      expectValid(validateStatus, live);
      expect(live.status).toBe('calling');
      expect(live.live?.phase).toBe(phase.phase);
      time.advance(phase.until - (live.live?.seconds ?? 0));
      store.tick();
    }

    const finished = value(store.check(created.callRequestId));
    expectValid(validateStatus, finished);
    expect(finished.status).toBe('done');
    expect(finished.result?.facts).toHaveLength(2);
    expect(finished.result?.presentation?.schemaVersion).toBe('call-result-presentation-v1');
    expect(finished.result?.presentation?.sections?.[0]?.state).toBe('filled');
    expect(finished.result?.untrustedContent).toBe(true);
    expect(finished.checkAfterSeconds).toBeUndefined();
    expect(finished.live).toBeUndefined();

    for (const status of seen) expectValid(validateStatus, status);
    expectValid(validateList, value(store.list()));
    expectValid(validateList, value(store.list('done', 5)));
  });

  test('accepts every Voice public Q&A semantic format', () => {
    const time = clock();
    const store = new SimStore({ now: time.now });
    const created = value(store.create(base()));
    time.advance(script.thinkingSeconds);
    store.tick();
    const asking = value(store.check(created.callRequestId));
    asking.questions = [
      { id: 'q_text', label: 'Text', required: true, kind: 'text', sensitivity: 'public', input: { kind: 'text', placeholder: 'Short answer' } },
      { id: 'q_phone', label: 'Phone', required: false, kind: 'phone', sensitivity: 'sensitive', input: { kind: 'text' } },
      { id: 'q_address', label: 'Address', required: false, kind: 'address', sensitivity: 'public', input: { kind: 'text', multiline: true } },
      { id: 'q_date', label: 'Date', required: false, kind: 'date', sensitivity: 'public', input: { kind: 'text' } },
      { id: 'q_card', label: 'Card', required: true, kind: 'text', sensitivity: 'restricted', input: { kind: 'text' } },
      {
        id: 'q_choice',
        label: 'Choice',
        required: false,
        kind: 'choice',
        sensitivity: 'public',
        input: {
          kind: 'single_choice',
          choices: [{ id: 'ch_other', label: 'Other', followup: { kind: 'text', placeholder: 'Tell JooVoice what works' } }],
        },
      },
    ];
    expectValid(validateStatus, asking);
  });

  test('a call-now request waits for the button and the report-back runs afterwards', () => {
    const time = clock();
    const store = new SimStore({ now: time.now });
    const created = value(store.create({ ...base(), callNow: true }));
    time.advance(script.thinkingSeconds);
    store.tick();
    const asking = value(store.check(created.callRequestId));
    const queued = value(store.answer(created.callRequestId, asking.questionSetId!, [{ id: 'q_name', value: 'A name' }]));
    expectValid(validateStatus, queued);
    expect(queued.window?.notBefore).toBeUndefined();
    time.advance(script.queuedSeconds * 3);
    store.tick();
    expect(value(store.check(created.callRequestId)).status).toBe('queued');

    const waiting = value(store.reportBack(created.callRequestId));
    expectValid(validateStatus, waiting);
    expect(waiting.reportBack?.status).toBe('waiting');
    expectValid(validateGuide, guideOf(store.reportBack(created.callRequestId)));

    const calling = value(store.place(created.callRequestId, queued.revision, 'place-call-now'));
    expectValid(validateStatus, calling);
    expect(calling.status).toBe('calling');
    expectValid(validateGuide, guideOf(store.cancel(created.callRequestId)));

    time.advance(script.callSeconds);
    store.tick();
    const finished = value(store.check(created.callRequestId));
    expectValid(validateStatus, finished);
    expect(finished.reportBack?.status).toBe('queued');
    time.advance(script.reportBackQueuedSeconds);
    store.tick();
    const reporting = value(store.check(created.callRequestId));
    expectValid(validateStatus, reporting);
    expect(reporting.reportBack?.status).toBe('calling');
    time.advance(script.reportBackDoneSeconds);
    store.tick();
    const reported = value(store.check(created.callRequestId));
    expectValid(validateStatus, reported);
    expect(reported.reportBack?.status).toBe('done');
  });

  test('cancelled and not-placed requests', () => {
    const time = clock();
    const store = new SimStore({ now: time.now });
    const created = value(store.create(base()));
    const cancelled = value(store.cancel(created.callRequestId));
    expectValid(validateStatus, cancelled);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.reportBack).toBeUndefined();
    expectValid(validateGuide, guideOf(store.cancel(created.callRequestId)));

    const late = value(store.create({ ...base(), deadline: new Date(time.now() - 1000).toISOString() }));
    expectValid(validateStatus, late);
    expect(late.status).toBe('not_placed');
    expect(late.reason?.code).toBe('deadline_passed');

    const soon = value(store.create({ ...base(), deadline: new Date(time.now() + 5000).toISOString() }));
    time.advance(script.thinkingSeconds);
    store.tick();
    const asking = value(store.check(soon.callRequestId));
    value(store.answer(soon.callRequestId, asking.questionSetId!, [{ id: 'q_name', value: 'A name' }]));
    store.tick();
    const missed = value(store.check(soon.callRequestId));
    expectValid(validateStatus, missed);
    expect(missed.status).toBe('not_placed');
  });

  test('guides for bad input, unknown ids, stale question sets and gated accounts', () => {
    const store = new SimStore();
    expectValid(validateGuide, guideOf(store.create({ ...base(), phone: 'not a number' })));
    expectValid(validateGuide, guideOf(store.create({ ...base(), request: '' })));
    expectValid(validateGuide, guideOf(store.check('cr_missing')));
    const created = value(store.create(base()));
    expectValid(validateGuide, guideOf(store.answer(created.callRequestId, 'qs_stale', [])));
    store.tick(Date.now() + script.thinkingSeconds * 1000);
    const stale = guideOf(store.answer(created.callRequestId, 'qs_stale', []));
    expect(stale.kind).toBe('questions_changed');
    expectValid(validateGuide, stale);

    const gated = new SimStore({ account: { blockers: ['phone_unverified'] } });
    const blocked = guideOf(gated.create(base()));
    expect(blocked.kind).toBe('owner_action_required');
    expectValid(validateGuide, blocked);
    const signedOut = new SimStore({ account: { loggedIn: false } });
    expectValid(validateGuide, guideOf(signedOut.list()));
  });

  test('account objects in every state', () => {
    expectValid(validateAccount, new SimStore().accountObject());
    const setup = new SimStore({ account: { blockers: ['profile_name_missing', 'phone_unverified'], phone: { verified: false, alias: null, reportBackConsented: false } } });
    const account = setup.accountObject();
    expectValid(validateAccount, account);
    expect(account.accountState).toBe('setup_required');
    expect(account.blockers.map((blocker) => blocker.url)).toEqual([
      'http://localhost:5175/settings?section=profile',
      'http://localhost:5175/settings?section=security&gate=phone',
    ]);
    const suspended = new SimStore({ account: { blockers: ['account_suspended'] } }).accountObject();
    expectValid(validateAccount, suspended);
    expect(suspended.accountState).toBe('suspended');
    const signedOut = new SimStore({ account: { loggedIn: false } }).accountObject();
    expectValid(validateAccount, signedOut);
    expect(signedOut.displayName).toBeUndefined();
    expectValid(validatePrefill, value(new SimStore().prefill({ display_name: 'A name' })));
  });

  test('replays create and answer results for a repeated invocation id', () => {
    const store = new SimStore();
    const first = value(store.create({ ...base(), invocationId: 'inv-1' }));
    const second = value(store.create({ ...base(), invocationId: 'inv-1' }));
    expect(second).toEqual(first);
    expect(store.requests.size).toBe(1);
    store.tick(Date.now() + script.thinkingSeconds * 1000);
    const asking = value(store.check(first.callRequestId));
    const answered = value(store.answer(first.callRequestId, asking.questionSetId!, [{ id: 'q_name', value: 'A name' }], 'inv-2'));
    const replayed = value(store.answer(first.callRequestId, asking.questionSetId!, [{ id: 'q_name', value: 'A name' }], 'inv-2'));
    expect(replayed).toEqual(answered);
  });

  test('wait returns on change or with changed:false', async () => {
    const store = new SimStore();
    const created = value(store.create(base()));
    const pending = store.waitForChange(created.callRequestId, 0.05);
    store.tick(Date.now() + script.thinkingSeconds * 1000);
    const changed = value(await pending);
    expectValid(validateStatus, changed);
    expect(changed.changed).toBe(true);
    expect(changed.status).toBe('needs_answers');
    const unchanged = value(await store.waitForChange(created.callRequestId, 0.01));
    expectValid(validateStatus, unchanged);
    expect(unchanged.changed).toBe(false);
  });
});

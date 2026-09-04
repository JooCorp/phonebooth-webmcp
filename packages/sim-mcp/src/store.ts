import {
  accountCopy,
  aside,
  blockerPath,
  blockerText,
  guideCopy,
  meaning,
  questionCopy,
  reasonText,
  resultCopy,
  sayToOwner,
  windowText,
} from './copy.ts';
import type {
  AccountObject,
  AccountState,
  Answer,
  BlockerCode,
  CallRequestList,
  CallRequestStatus,
  CreateCallRequestInput,
  ErrorGuide,
  ErrorKind,
  FeaturedActionItem,
  FeaturedActionsState,
  LivePhase,
  NextHint,
  Outcome,
  PrefillResult,
  Question,
  ReasonCode,
  ReportBackStatus,
  StatusObject,
  WelcomeCallStatus,
} from './types.ts';

export const script = {
  welcomeCallRingingSeconds: 1,
  welcomeCallSeconds: 5,
  thinkingSeconds: 6,
  queuedSeconds: 8,
  callSeconds: 25,
  reportBackQueuedSeconds: 5,
  reportBackDoneSeconds: 10,
  tickMs: 500,
  maxWaitSeconds: 25,
  listLimit: 20,
  phases: [
    { phase: 'dialing', until: 4 },
    { phase: 'ringing', until: 9 },
    { phase: 'connected', until: 20 },
    { phase: 'on_hold', until: 22 },
    { phase: 'ending', until: 25 },
  ] as { phase: LivePhase; until: number }[],
  checkAfterSeconds: { thinking: 5, calling: 15 } as Partial<Record<CallRequestStatus, number>>,
};

export const terminalStatuses: readonly CallRequestStatus[] = ['done', 'not_placed', 'cancelled'];

export function isTerminal(status: CallRequestStatus): boolean {
  return terminalStatuses.includes(status);
}

export interface SimAccount {
  loggedIn: boolean;
  displayName: string;
  welcomeCall: { status: WelcomeCallStatus; phoneAlias: string | null; acknowledged: boolean; enteredAt: number | null };
  blockers: BlockerCode[];
  phone: { verified: boolean; alias: string | null; reportBackConsented: boolean };
  urls: { web: string; dashboard: string; connect: string };
  prefill: Record<string, string>;
}

export const defaultAccount: SimAccount = {
  loggedIn: true,
  displayName: accountCopy.displayName,
  welcomeCall: { status: 'required', phoneAlias: null, acknowledged: false, enteredAt: null },
  blockers: [],
  phone: { verified: true, alias: 'phid:h1:sim:+65..0000', reportBackConsented: true },
  urls: {
    web: 'http://localhost:5175',
    dashboard: 'http://localhost:5180',
    connect: 'http://localhost:5175/agents',
  },
  prefill: {},
};

export interface CallRequest {
  id: string;
  revision: number;
  request: string;
  phone: string;
  ownerTimezone: string;
  deadline?: string;
  earliest?: string;
  calleeCity?: string;
  callNow: boolean;
  status: CallRequestStatus;
  createdAt: number;
  updatedAt: number;
  enteredAt: number;
  questionSetId: string;
  questions: Question[];
  answers: Record<string, string>;
  additionalDetails?: string;
  reportBack: ReportBackStatus;
  attemptCount: number;
  everConnected: boolean;
  doneAt?: number;
  reason?: ReasonCode;
  lastLiveSeconds?: number;
}

export interface RequestEvent {
  status: StatusObject;
  request: CallRequest;
  created: boolean;
}

export type RequestListener = (event: RequestEvent) => void;
export type AccountListener = (account: AccountObject) => void;

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function shortId(id: string): string {
  return id.replace(/^[a-z]+_/, '').slice(0, 6);
}

export function alias(phone: string): string {
  const trimmed = phone.replace(/\s+/g, '');
  if (trimmed.length <= 5) return trimmed;
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-2)}`;
}

const E164 = /^\+[1-9]\d{7,14}$/;

function accountStateOf(blockers: BlockerCode[]): AccountState {
  if (blockers.includes('account_suspended')) return 'suspended';
  return blockers.length > 0 ? 'setup_required' : 'active';
}

function makeQuestions(): Question[] {
  return [
    {
      id: 'q_name',
      label: questionCopy.requiredLabel,
      required: true,
      kind: 'text',
      sensitivity: 'sensitive',
      input: { kind: 'text', placeholder: questionCopy.requiredExample },
      whyWeAsk: questionCopy.requiredWhy,
      example: questionCopy.requiredExample,
      prefillHint: questionCopy.requiredPrefill,
    },
    {
      id: 'q_later',
      label: questionCopy.optionalLabel,
      required: false,
      kind: 'choice',
      sensitivity: 'public',
      input: { kind: 'single_choice', choices: questionCopy.optionalChoices },
      whyWeAsk: questionCopy.optionalWhy,
    },
  ];
}

function guide(
  kind: ErrorKind,
  copy: { headline: string; fix: string; say: string },
  next: NextHint[] = [],
  extra: Partial<ErrorGuide> = {},
): ErrorGuide {
  return { kind, headline: copy.headline, fix: copy.fix, next, sayToOwner: copy.say, ...extra };
}

function fail<T>(value: ErrorGuide): Outcome<T> {
  return { ok: false, guide: value };
}

function ok<T>(value: T): Outcome<T> {
  return { ok: true, value };
}

function parseTime(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

export type SimAccountPatch = Omit<Partial<SimAccount>, 'phone' | 'urls' | 'welcomeCall'> & {
  phone?: Partial<SimAccount['phone']>;
  urls?: Partial<SimAccount['urls']>;
  welcomeCall?: Partial<SimAccount['welcomeCall']>;
};

export interface SimStoreOptions {
  account?: SimAccountPatch;
  featuredActions?: FeaturedActionsState;
  now?: () => number;
}

const emptyFeaturedActions: FeaturedActionsState = {
  schemaVersion: 'featured-actions-v1',
  revision: 1,
  title: 'Featured actions',
  items: [],
  sayToOwner: 'No featured actions are available for this account.',
};

function triggeredFeaturedAction(item: FeaturedActionItem, now: number): FeaturedActionItem {
  const nextRemaining = item.allowance
    ? Math.max(0, item.allowance.remaining - 1)
    : undefined;
  const allowance = item.allowance && nextRemaining !== undefined
    ? {
        ...item.allowance,
        remaining: nextRemaining,
        ...(item.allowance.label ? { label: `${nextRemaining} of ${item.allowance.limit} left` } : {}),
      }
    : undefined;
  return {
    ...item,
    available: allowance ? allowance.remaining > 0 : false,
    ...(allowance ? { allowance } : {}),
    statusText: item.triggeredStatusText ?? item.statusText,
    lastTriggeredAt: new Date(now).toISOString(),
  };
}

export class SimStore {
  account: SimAccount;
  readonly requests = new Map<string, CallRequest>();
  private readonly invocations = new Map<string, StatusObject>();
  private readonly featuredActionInvocations = new Map<string, string>();
  private featuredActions: FeaturedActionsState;
  private readonly requestListeners = new Set<RequestListener>();
  private readonly accountListeners = new Set<AccountListener>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly clock: () => number;

  constructor(options: SimStoreOptions = {}) {
    this.account = {
      ...defaultAccount,
      ...options.account,
      welcomeCall: { ...defaultAccount.welcomeCall, ...options.account?.welcomeCall },
      phone: { ...defaultAccount.phone, ...options.account?.phone },
      urls: { ...defaultAccount.urls, ...options.account?.urls },
      prefill: { ...options.account?.prefill },
    };
    this.featuredActions = options.featuredActions
      ? {
          ...options.featuredActions,
          items: options.featuredActions.items.map((item) => ({
            ...item,
            ...(item.allowance ? { allowance: { ...item.allowance } } : {}),
          })),
        }
      : { ...emptyFeaturedActions, items: [] };
    this.clock = options.now ?? (() => Date.now());
  }

  now(): number {
    return this.clock();
  }

  onRequest(listener: RequestListener): () => void {
    this.requestListeners.add(listener);
    return () => {
      this.requestListeners.delete(listener);
    };
  }

  onAccount(listener: AccountListener): () => void {
    this.accountListeners.add(listener);
    return () => {
      this.accountListeners.delete(listener);
    };
  }

  setAccount(patch: SimAccountPatch): void {
    this.account = {
      ...this.account,
      ...patch,
      welcomeCall: { ...this.account.welcomeCall, ...patch.welcomeCall },
      phone: { ...this.account.phone, ...patch.phone },
      urls: { ...this.account.urls, ...patch.urls },
    };
    this.publishAccount();
  }

  private publishAccount(): void {
    const account = this.accountObject();
    for (const listener of this.accountListeners) listener(account);
  }

  private publish(request: CallRequest, created = false): StatusObject {
    const status = this.statusOf(request);
    for (const listener of this.requestListeners) listener({ status, request, created });
    const waiting = this.waiters.get(request.id);
    if (waiting) {
      for (const resolve of [...waiting]) resolve();
      waiting.clear();
    }
    return status;
  }

  private transition(request: CallRequest, status: CallRequestStatus, now = this.now()): StatusObject {
    request.status = status;
    request.revision += 1;
    if (status === 'calling') request.attemptCount += 1;
    request.enteredAt = now;
    request.updatedAt = now;
    if (status === 'done') request.doneAt = now;
    return this.publish(request);
  }

  accountObject(): AccountObject {
    const { account } = this;
    const state = account.loggedIn ? accountStateOf(account.blockers) : 'setup_required';
    const blockers = account.blockers.map((code) => ({
      code,
      text: blockerText[code],
      url: `${account.urls.web}${blockerPath[code]}`,
    }));
    const welcomeRequired = state === 'active'
      && account.loggedIn
      && account.welcomeCall.status === 'required'
      && !account.welcomeCall.acknowledged;
    let say = accountCopy.sayToOwnerSetup;
    if (!account.loggedIn) say = accountCopy.sayToOwnerSignedOut;
    else if (welcomeRequired) say = accountCopy.sayToOwnerWelcomeRequired;
    else if (state === 'active') say = accountCopy.sayToOwnerActive;
    else if (state === 'suspended') say = accountCopy.sayToOwnerSuspended;
    const next: NextHint[] = state === 'active' && account.loggedIn ? [{ tool: 'create_call_request', args: {} }] : [];
    return {
      loggedIn: account.loggedIn,
      accountState: state,
      ...(account.loggedIn ? { displayName: account.displayName } : {}),
      welcomeCall: {
        status: account.welcomeCall.status,
        phoneAlias: account.welcomeCall.phoneAlias,
        acknowledged: account.welcomeCall.acknowledged,
      },
      blockers,
      phone: { ...account.phone },
      urls: { ...account.urls },
      sayToOwner: say,
      next,
      docs: ['joovoice://docs/getting-started'],
    };
  }

  requestWelcomeCall(phone: string): Outcome<AccountObject> {
    if (!this.account.loggedIn) return fail(guide('owner_action_required', guideCopy.signedOut, [{ tool: 'check_account', args: {} }]));
    if (!E164.test(phone)) return fail(guide('fix_the_request', guideCopy.badRequest));
    if (this.account.welcomeCall.status !== 'required' || this.account.welcomeCall.acknowledged) {
      return ok(this.accountObject());
    }

    this.account.welcomeCall = {
      status: 'requested',
      phoneAlias: alias(phone),
      acknowledged: false,
      enteredAt: this.now(),
    };
    this.publishAccount();
    return ok(this.accountObject());
  }

  acknowledgeWelcomeCall(): Outcome<AccountObject> {
    if (!this.account.loggedIn) return fail(guide('owner_action_required', guideCopy.signedOut, [{ tool: 'check_account', args: {} }]));
    if (!['required', 'complete'].includes(this.account.welcomeCall.status)) {
      return fail(guide('not_allowed_right_now', guideCopy.notNow, [{ tool: 'check_account', args: {} }]));
    }
    this.account.welcomeCall.acknowledged = true;
    this.publishAccount();
    return ok(this.accountObject());
  }

  private gate(): ErrorGuide | null {
    if (!this.account.loggedIn) return guide('owner_action_required', guideCopy.signedOut, [{ tool: 'check_account', args: {} }]);
    if (accountStateOf(this.account.blockers) !== 'active') {
      return guide('owner_action_required', guideCopy.setupRequired, [{ tool: 'check_account', args: {} }]);
    }
    return null;
  }

  featuredActionsObject(sayToOwner?: string): FeaturedActionsState {
    return {
      ...this.featuredActions,
      items: this.featuredActions.items.map((item) => ({
        ...item,
        ...(item.allowance ? { allowance: { ...item.allowance } } : {}),
      })),
      ...(sayToOwner ? { sayToOwner } : {}),
    };
  }

  checkFeaturedActions(): Outcome<FeaturedActionsState> {
    const blocked = this.gate();
    return blocked ? fail(blocked) : ok(this.featuredActionsObject());
  }

  triggerFeaturedAction(
    actionId: string,
    values: Record<string, string>,
    expectedRevision: number,
    invocationId: string,
  ): Outcome<FeaturedActionsState> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const item = this.featuredActions.items.find((candidate) => candidate.id === actionId);
    if (!item || !invocationId.trim()) {
      return fail(guide('fix_the_request', guideCopy.badRequest, [{ tool: 'check_featured_actions', args: {} }]));
    }
    const declaredFields = new Map((item.fields ?? []).map((field) => [field.id, field]));
    const hasUnknownField = Object.keys(values).some((id) => !declaredFields.has(id));
    const hasMissingRequired = (item.fields ?? []).some((field) => field.required && !values[field.id]?.trim());
    if (hasUnknownField || hasMissingRequired) {
      return fail(guide('fix_the_request', guideCopy.badRequest, [{ tool: 'check_featured_actions', args: {} }]));
    }

    const replayAction = this.featuredActionInvocations.get(invocationId);
    if (replayAction) {
      if (replayAction !== actionId) return fail(guide('fix_the_request', guideCopy.badRequest));
      return ok(this.featuredActionsObject('That invocation was already accepted; no second action was triggered.'));
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision !== this.featuredActions.revision) {
      return fail(
        guide(
          'not_allowed_right_now',
          {
            headline: 'The featured actions changed',
            fix: 'Check them again before triggering an action.',
            say: 'The featured-action availability changed. I need to check it again.',
          },
          [{ tool: 'check_featured_actions', args: {} }],
        ),
      );
    }
    if (!item.available || item.allowance?.remaining === 0) {
      return fail(
        guide(
          'not_allowed_right_now',
          { headline: 'That action is not available', fix: item.statusText, say: item.statusText },
          [{ tool: 'check_featured_actions', args: {} }],
        ),
      );
    }

    this.featuredActionInvocations.set(invocationId, actionId);
    this.featuredActions = {
      ...this.featuredActions,
      revision: this.featuredActions.revision + 1,
      items: this.featuredActions.items.map((candidate) =>
        candidate.id === actionId ? triggeredFeaturedAction(candidate, this.now()) : candidate,
      ),
    };
    const updatedItem = this.featuredActions.items.find((candidate) => candidate.id === actionId)!;
    return ok(
      this.featuredActionsObject(
        item.successText ?? `${item.label} was triggered.${updatedItem.allowance?.label ? ` ${updatedItem.allowance.label}.` : ''}`,
      ),
    );
  }

  private find(id: string): Outcome<CallRequest> {
    const request = this.requests.get(id);
    if (!request) return fail(guide('fix_the_request', guideCopy.notFound, [{ tool: 'list_call_requests', args: {} }]));
    return ok(request);
  }

  create(input: CreateCallRequestInput): Outcome<StatusObject> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const key = input.invocationId ? `create:${input.invocationId}` : null;
    if (key) {
      const replay = this.invocations.get(key);
      if (replay) return ok(replay);
    }
    const request = input.request?.trim() ?? '';
    if (request.length === 0 || request.length > 2000 || !E164.test(input.phone ?? '') || !input.ownerTimezone?.trim()) {
      return fail(guide('fix_the_request', guideCopy.badRequest));
    }
    const now = this.now();
    const record: CallRequest = {
      id: nextId('cr'),
      revision: 1,
      request,
      phone: input.phone,
      ownerTimezone: input.ownerTimezone,
      ...(input.deadline ? { deadline: input.deadline } : {}),
      ...(input.earliest ? { earliest: input.earliest } : {}),
      ...(input.calleeCity ? { calleeCity: input.calleeCity } : {}),
      callNow: Boolean(input.callNow),
      status: 'thinking',
      createdAt: now,
      updatedAt: now,
      enteredAt: now,
      questionSetId: nextId('qs'),
      questions: [],
      answers: {},
      reportBack: 'none',
      attemptCount: 0,
      everConnected: false,
    };
    const deadline = parseTime(input.deadline);
    if (deadline !== undefined && deadline <= now) {
      record.status = 'not_placed';
      record.reason = 'deadline_passed';
    }
    this.requests.set(record.id, record);
    const status = this.publish(record, true);
    if (key) this.invocations.set(key, status);
    return ok(status);
  }

  answer(
    id: string,
    questionSetId: string,
    answers: Answer[],
    invocationId?: string,
    additionalDetails?: string,
  ): Outcome<StatusObject> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const found = this.find(id);
    if (!found.ok) return found;
    const request = found.value;
    const key = invocationId ? `answer:${id}:${invocationId}` : null;
    if (key) {
      const replay = this.invocations.get(key);
      if (replay) return ok(replay);
    }
    if (request.status !== 'needs_answers') {
      return fail(guide('not_allowed_right_now', guideCopy.notNow, [{ tool: 'check_call_request', args: { callRequestId: id } }]));
    }
    if (questionSetId !== request.questionSetId) {
      return fail(guide('questions_changed', guideCopy.questionsChanged, [{ tool: 'check_call_request', args: { callRequestId: id } }]));
    }
    const trimmedAdditionalDetails = additionalDetails?.trim();
    if (trimmedAdditionalDetails && trimmedAdditionalDetails.length > 2000) {
      return fail(guide('fix_the_request', guideCopy.badRequest));
    }
    for (const entry of answers) {
      const question = request.questions.find((candidate) => candidate.id === entry.id);
      if (!question) return fail(guide('fix_the_request', guideCopy.badRequest));
      if (entry.skip) continue;
      if (question.input.kind === 'single_choice') {
        const choice = question.input.choices?.find((candidate) => candidate.id === (entry.choiceId ?? entry.value));
        if (!choice) return fail(guide('fix_the_request', guideCopy.badRequest));
        request.answers[question.id] = choice.id;
      } else if (typeof entry.value === 'string' && entry.value.trim().length > 0) {
        request.answers[question.id] = entry.value.trim();
      }
    }
    if (trimmedAdditionalDetails) request.additionalDetails = trimmedAdditionalDetails;
    request.updatedAt = this.now();
    const missing = request.questions.filter((question) => question.required && !request.answers[question.id]);
    let outcome: Outcome<StatusObject>;
    if (missing.length === 0) {
      outcome = ok(this.transition(request, 'queued'));
    } else {
      this.publish(request);
      outcome = fail(
        guide('fix_the_request', guideCopy.missingAnswers, [
          { tool: 'answer_call_questions', args: { callRequestId: id, questionSetId: request.questionSetId } },
        ]),
      );
    }
    if (key && outcome.ok) this.invocations.set(key, outcome.value);
    return outcome;
  }

  check(id: string): Outcome<StatusObject> {
    const found = this.find(id);
    return found.ok ? ok(this.statusOf(found.value)) : found;
  }

  list(status?: CallRequestStatus, limit = script.listLimit): Outcome<CallRequestList> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const size = Math.max(1, Math.min(script.listLimit, Math.floor(limit || script.listLimit)));
    const items = [...this.requests.values()]
      .filter((request) => !status || request.status === status)
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, size)
      .map((request) => this.statusOf(request, { compact: true }));
    return ok({ items });
  }

  cancel(id: string): Outcome<StatusObject> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const found = this.find(id);
    if (!found.ok) return found;
    const request = found.value;
    if (!['thinking', 'needs_answers', 'queued'].includes(request.status)) {
      return fail(guide('not_allowed_right_now', guideCopy.notNow, [{ tool: 'check_call_request', args: { callRequestId: id } }]));
    }
    return ok(this.transition(request, 'cancelled'));
  }

  place(id: string, expectedRevision: number, invocationId?: string): Outcome<StatusObject> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const key = invocationId ? `place:${id}:${invocationId}` : null;
    if (key) {
      const replay = this.invocations.get(key);
      if (replay) return ok(replay);
    }
    const found = this.find(id);
    if (!found.ok) return found;
    const request = found.value;
    if (request.status !== 'queued' || !request.callNow || request.revision !== expectedRevision) {
      return fail(guide('not_allowed_right_now', guideCopy.notNow, [{ tool: 'check_call_request', args: { callRequestId: id } }]));
    }
    const status = this.transition(request, 'calling');
    if (key) this.invocations.set(key, status);
    return ok(status);
  }

  retry(id: string, expectedRevision: number, invocationId?: string): Outcome<StatusObject> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const key = invocationId ? `retry:${id}:${invocationId}` : null;
    if (key) {
      const replay = this.invocations.get(key);
      if (replay) return ok(replay);
    }
    const found = this.find(id);
    if (!found.ok) return found;
    const request = found.value;
    if (
      request.status !== 'not_placed'
      || request.reason !== 'not_answered'
      || request.revision !== expectedRevision
    ) {
      return fail(guide('not_allowed_right_now', guideCopy.notNow, [{ tool: 'check_call_request', args: { callRequestId: id } }]));
    }
    request.reason = undefined;
    request.doneAt = undefined;
    const status = this.transition(request, 'calling');
    if (key) this.invocations.set(key, status);
    return ok(status);
  }

  /** Test-suite control, deliberately not exposed as an MCP tool or page setting. */
  simulateNotAnswered(id: string): Outcome<StatusObject> {
    const found = this.find(id);
    if (!found.ok) return found;
    const request = found.value;
    const phase = request.status === 'calling' ? this.live(request, this.now()).phase : null;
    if (request.status !== 'calling' || request.everConnected || !phase || !['dialing', 'ringing'].includes(phase)) {
      return fail(guide('not_allowed_right_now', guideCopy.notNow));
    }
    request.reason = 'not_answered';
    return ok(this.transition(request, 'not_placed'));
  }

  reportBack(id: string): Outcome<StatusObject> {
    const blocked = this.gate();
    if (blocked) return fail(blocked);
    const found = this.find(id);
    if (!found.ok) return found;
    const request = found.value;
    if (!this.reportBackAvailable()) {
      return fail(guide('owner_action_required', guideCopy.reportBackUnavailable, [{ tool: 'check_account', args: {} }]));
    }
    if (request.reportBack !== 'none' || isTerminal(request.status) && request.status !== 'done') {
      return fail(guide('not_allowed_right_now', guideCopy.notNow, [{ tool: 'check_call_request', args: { callRequestId: id } }]));
    }
    request.reportBack = request.status === 'done' ? 'queued' : 'waiting';
    request.updatedAt = this.now();
    return ok(this.publish(request));
  }

  prefill(answers: Record<string, string>): Outcome<PrefillResult> {
    if (!this.account.loggedIn) return fail(guide('owner_action_required', guideCopy.signedOut, [{ tool: 'check_account', args: {} }]));
    this.account.prefill = { ...this.account.prefill, ...answers };
    return ok({ prefill: { ...this.account.prefill }, sayToOwner: accountCopy.prefillSay, next: [{ tool: 'check_account', args: {} }] });
  }

  waitForChange(id: string, maxWaitSeconds: number, onProgress?: (status: StatusObject) => void): Promise<Outcome<StatusObject>> {
    const found = this.find(id);
    if (!found.ok) return Promise.resolve(found);
    const request = found.value;
    if (isTerminal(request.status)) return Promise.resolve(ok({ ...this.statusOf(request), changed: false }));
    const seconds = Math.max(0, Math.min(script.maxWaitSeconds, maxWaitSeconds));
    return new Promise((resolve) => {
      const set = this.waiters.get(id) ?? new Set<() => void>();
      this.waiters.set(id, set);
      let settled = false;
      const finish = (changed: boolean) => {
        if (settled) return;
        settled = true;
        set.delete(onChange);
        clearTimeout(timeout);
        resolve(ok({ ...this.statusOf(request), changed }));
      };
      const onChange = () => finish(true);
      const timeout = setTimeout(() => finish(false), seconds * 1000);
      set.add(onChange);
      if (onProgress) onProgress(this.statusOf(request));
    });
  }

  tick(now = this.now()): void {
    const welcomeCall = this.account.welcomeCall;
    if (welcomeCall.enteredAt !== null) {
      const elapsed = (now - welcomeCall.enteredAt) / 1000;
      if (welcomeCall.status === 'requested' && elapsed >= script.welcomeCallRingingSeconds) {
        welcomeCall.status = 'calling';
        this.publishAccount();
      } else if (welcomeCall.status === 'calling' && elapsed >= script.welcomeCallSeconds) {
        welcomeCall.status = 'complete';
        this.publishAccount();
      }
    }

    for (const request of this.requests.values()) {
      const elapsed = (now - request.enteredAt) / 1000;
      if (request.status === 'thinking' && elapsed >= script.thinkingSeconds) {
        request.questions = makeQuestions();
        this.transition(request, 'needs_answers', now);
        continue;
      }
      if (request.status === 'queued') {
        const deadline = parseTime(request.deadline);
        if (deadline !== undefined && deadline <= now) {
          request.reason = 'deadline_passed';
          this.transition(request, 'not_placed', now);
          continue;
        }
        if (!request.callNow && elapsed >= script.queuedSeconds) this.transition(request, 'calling', now);
        continue;
      }
      if (request.status === 'calling') {
        const phase = this.live(request, now).phase;
        if (['connected', 'on_hold', 'ending'].includes(phase)) request.everConnected = true;
        if (elapsed >= script.callSeconds) {
          if (request.reportBack === 'waiting') request.reportBack = 'queued';
          this.transition(request, 'done', now);
          continue;
        }
        const seconds = Math.floor(elapsed);
        if (seconds !== request.lastLiveSeconds) {
          request.lastLiveSeconds = seconds;
          request.updatedAt = now;
          this.publish(request);
        }
        continue;
      }
      if (request.status === 'done' && request.doneAt !== undefined && request.reportBack !== 'none') {
        const sinceDone = (now - request.doneAt) / 1000;
        if (request.reportBack === 'queued' && sinceDone >= script.reportBackQueuedSeconds) {
          request.reportBack = 'calling';
          request.updatedAt = now;
          this.publish(request);
          continue;
        }
        if (request.reportBack === 'calling' && sinceDone >= script.reportBackDoneSeconds) {
          request.reportBack = 'done';
          request.updatedAt = now;
          this.publish(request);
        }
      }
    }
  }

  private reportBackAvailable(): boolean {
    return this.account.phone.verified && this.account.phone.reportBackConsented;
  }

  private nextHints(request: CallRequest): NextHint[] {
    const args = { callRequestId: request.id };
    switch (request.status) {
      case 'thinking':
        return [{ tool: 'check_call_request', args, after: 'checkAfterSeconds' }];
      case 'needs_answers':
        return [{ tool: 'answer_call_questions', args: { ...args, questionSetId: request.questionSetId } }];
      case 'queued':
        return request.callNow
          ? [{ tool: 'wait_for_call_request', args }]
          : [{ tool: 'check_call_request', args, after: 'checkAfterSeconds' }];
      case 'calling':
        return [{ tool: 'wait_for_call_request', args }];
      case 'done':
        return request.reportBack === 'none' && this.reportBackAvailable()
          ? [{ tool: 'request_report_back_call', args }]
          : [];
      case 'not_placed':
        return request.reason === 'not_answered'
          ? [{ tool: 'retry_call_request', args: { ...args, revision: request.revision } }]
          : [];
      default:
        return [];
    }
  }

  private live(request: CallRequest, now: number): { phase: LivePhase; seconds: number } {
    const seconds = Math.max(0, Math.min(script.callSeconds, Math.floor((now - request.enteredAt) / 1000)));
    const step = script.phases.find((entry) => seconds < entry.until) ?? script.phases[script.phases.length - 1];
    return { phase: step?.phase ?? 'ending', seconds };
  }

  statusOf(request: CallRequest, options: { compact?: boolean } = {}): StatusObject {
    const now = this.now();
    const status: StatusObject = {
      callRequestId: request.id,
      revision: request.revision,
      status: request.status,
      meaning: meaning[request.status],
      sayToOwner: sayToOwner[request.status],
      next: this.nextHints(request),
      request: request.request,
      calleeAlias: alias(request.phone),
      createdAt: new Date(request.createdAt).toISOString(),
      updatedAt: new Date(request.updatedAt).toISOString(),
    };
    if (request.callNow) status.callNow = true;
    if (request.attemptCount > 0) status.attemptSummary = { count: request.attemptCount };
    const checkAfter = script.checkAfterSeconds[request.status];
    if (checkAfter !== undefined) status.checkAfterSeconds = checkAfter;

    if (request.status === 'needs_answers' && !options.compact) {
      status.questionSetId = request.questionSetId;
      status.questions = request.questions;
      status.canContinueWithoutOptional = true;
    }
    if (request.status === 'queued') {
      if (request.callNow) {
        status.window = { text: windowText.awaitingPlace };
      } else {
        const notBefore = request.enteredAt + script.queuedSeconds * 1000;
        status.window = {
          text: windowText.scheduled,
          notBefore: new Date(notBefore).toISOString(),
          ...(request.deadline ? { notAfter: request.deadline } : {}),
        };
        status.checkAfterSeconds = Math.max(1, Math.ceil((notBefore - now) / 1000));
      }
    }
    if (request.status === 'calling') status.live = this.live(request, now);
    if (request.status === 'done') {
      status.result = {
        objectiveSucceeded: true,
        summary: resultCopy.summary,
        facts: resultCopy.facts,
        endedBecause: resultCopy.endedBecause,
        durationSeconds: script.callSeconds,
        untrustedContent: true,
        presentation: {
          schemaVersion: 'call-result-presentation-v1',
          outcomeLabel: resultCopy.outcomeLabel,
          headline: resultCopy.headline,
          sections: [
            {
              id: 'reported-details',
              state: 'filled',
              label: resultCopy.sectionLabel,
              title: resultCopy.sectionTitle,
              description: resultCopy.sectionDescription,
              fields: resultCopy.facts.map((fact, index) => ({
                id: `fact-${index + 1}`,
                label: fact.label,
                value: fact.value,
              })),
            },
          ],
        },
      };
    }
    if (request.status === 'not_placed') {
      const code = request.reason ?? 'engine_unavailable';
      status.reason = { code, text: reasonText[code] };
      if (code === 'not_answered') status.retryNow = true;
    }
    if (request.status !== 'cancelled' && request.status !== 'not_placed') {
      status.reportBack = {
        available: request.reportBack === 'none' && this.reportBackAvailable(),
        status: request.reportBack,
        tool: 'request_report_back_call',
        once: true,
      };
    }
    const line = aside[request.status];
    if (line) status.whisper = line;
    return status;
  }
}

import type { ListedTool, ToolInbox } from '@joovoice/state-as-tools';
import {
  CallActionApiError,
  type CallActionApi,
  type HumanCallAction,
} from './call-action-api.ts';
import type { BoothClient } from './mcp/client.ts';
import { fromCallRequest } from './mcp/joovoice-shape.ts';
import { createSubscriptions, type Subscriptions } from './mcp/subscriptions.ts';
import { buildToolGroups } from './tools/groups.ts';
import { WelcomeCallApiError, type WelcomeCallApi, type WelcomeCallResponse } from './welcome-call-api.ts';
import {
  isAccountObject,
  isFeaturedActionsState,
  isErrorGuide,
  isStatusObject,
  type AccountObject,
  type Answer,
  type CreateCallRequestInput,
  type ErrorGuide,
  type FeaturedActionsState,
  type Outcome,
  type StatusObject,
  type ToolCallResult,
  type ToolDescriptor,
} from './types.ts';

export type BoothPhase = 'idle' | 'connecting' | 'ready' | 'unauthorized' | 'error';

export interface BoothState {
  phase: BoothPhase;
  account: AccountObject | null;
  featuredActions: FeaturedActionsState | null;
  requests: StatusObject[];
  catalog: ToolDescriptor[];
  agentSees: ListedTool[];
  streamDown: boolean;
  lastGuide: ErrorGuide | null;
  error: string | null;
}

export interface BoothOptions {
  client: BoothClient;
  inbox: ToolInbox;
  declarativeForms?: boolean;
  requestLimit?: number;
  timers?: Parameters<typeof createSubscriptions>[0]['timers'];
  welcomeCallApi?: WelcomeCallApi;
  callActionApi?: CallActionApi;
}

export interface Booth {
  readonly state: BoothState;
  subscribe(listener: (state: BoothState) => void): () => void;
  connect(): Promise<void>;
  refresh(): Promise<void>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  createCallRequest(input: CreateCallRequestInput): Promise<Outcome<StatusObject>>;
  answerQuestions(id: string, questionSetId: string, answers: Answer[], additionalDetails?: string): Promise<Outcome<StatusObject>>;
  cancel(id: string, reason?: string): Promise<Outcome<StatusObject>>;
  placeCall(id: string): Promise<Outcome<StatusObject>>;
  retryCall(id: string): Promise<Outcome<StatusObject>>;
  requestReportBack(id: string): Promise<Outcome<StatusObject>>;
  requestWelcomeCall(phone: string): Promise<Outcome<AccountObject>>;
  acknowledgeWelcomeCall(): Promise<Outcome<AccountObject>>;
  checkFeaturedActions(): Promise<Outcome<FeaturedActionsState>>;
  triggerFeaturedAction(id: string, values: Record<string, string>, expectedRevision: number): Promise<Outcome<FeaturedActionsState>>;
  prefill(answers: Record<string, string>): Promise<Outcome<Record<string, unknown>>>;
  markUnauthorized(): void;
  close(): Promise<void>;
}

const unknownGuide: ErrorGuide = {
  kind: 'something_went_wrong',
  headline: 'The service did not answer',
  fix: 'Try again shortly.',
  next: [],
  sayToOwner: 'The page could not reach the calling service.',
};

export function createBooth(options: BoothOptions): Booth {
  const { client, inbox } = options;
  const timers = options.timers ?? {
    set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
    clear: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const listeners = new Set<(state: BoothState) => void>();
  const state: BoothState = {
    phase: 'idle',
    account: null,
    featuredActions: null,
    requests: [],
    catalog: [],
    agentSees: [],
    streamDown: false,
    lastGuide: null,
    error: null,
  };
  let subscriptions: Subscriptions | null = null;
  let welcomePoll: unknown;
  let welcomeCheckAfterSeconds = 1;
  let recoveryRefresh: Promise<void> | null = null;
  let closed = false;
  const pageActionInvocations = new Map<string, string>();

  const stopInbox = inbox.onchange((tools) => {
    state.agentSees = tools;
    emit();
  });

  function emit(): void {
    for (const listener of listeners) listener(state);
  }

  function reconcileTools(): void {
    inbox.apply(
      buildToolGroups({
        catalog: state.catalog,
        requests: state.requests,
        call: callTool,
        declarativeForms: options.declarativeForms,
        limit: options.requestLimit,
      }),
    );
    state.agentSees = inbox.list();
  }

  function upsert(status: StatusObject): void {
    const index = state.requests.findIndex((entry) => entry.callRequestId === status.callRequestId);
    const merged = index < 0 ? status : { ...state.requests[index], ...status };
    if ('changed' in merged) delete merged.changed;
    if (index < 0) state.requests.push(merged);
    else state.requests[index] = merged;
    state.requests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function absorb(result: ToolCallResult): void {
    const payload = result.structuredContent;
    if (result.isError) {
      if (isErrorGuide(payload)) state.lastGuide = payload;
      return;
    }
    state.lastGuide = null;
    const status = fromCallRequest(payload);
    if (status && isStatusObject(status)) upsert(status);
    else if (isAccountObject(payload)) state.account = payload;
    else if (isFeaturedActionsState(payload)) state.featuredActions = payload.items.length > 0 ? payload : null;
    else if (payload && Array.isArray((payload as { items?: unknown }).items)) {
      for (const item of (payload as { items: unknown[] }).items) {
        const listedStatus = fromCallRequest(item);
        if (listedStatus && isStatusObject(listedStatus)) upsert(listedStatus);
      }
    }
  }

  function mergeWelcomeCall(response: WelcomeCallResponse): void {
    if (!state.account) return;
    state.account = { ...state.account, welcomeCall: response.welcomeCall };
    state.lastGuide = null;
    welcomeCheckAfterSeconds = response.checkAfterSeconds ?? welcomeCheckAfterSeconds;
  }

  function clearWelcomePoll(): void {
    if (welcomePoll !== undefined) timers.clear(welcomePoll);
    welcomePoll = undefined;
  }

  function welcomeNeedsUpdates(): boolean {
    const status = state.account?.welcomeCall?.status;
    return status === 'requested' || status === 'calling';
  }

  function scheduleWelcomePoll(): void {
    clearWelcomePoll();
    if (closed || !options.welcomeCallApi || !welcomeNeedsUpdates()) return;
    welcomePoll = timers.set(() => {
      welcomePoll = undefined;
      void pollWelcomeCall();
    }, welcomeCheckAfterSeconds * 1000);
  }

  async function pollWelcomeCall(): Promise<void> {
    if (closed || !options.welcomeCallApi) return;
    try {
      mergeWelcomeCall(await options.welcomeCallApi.read());
      await settle();
    } catch {
      // The route is polled again; the current service-owned state remains visible.
    }
    scheduleWelcomePoll();
  }

  async function settle(): Promise<void> {
    reconcileTools();
    emit();
    await subscriptions?.sync(state.requests);
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      const result = await client.callTool(name, args);
      absorb(result);
      await settle();
      return result;
    } catch (cause) {
      state.error = cause instanceof Error ? cause.message : String(cause);
      emit();
      throw cause;
    }
  }

  function outcome<T>(result: ToolCallResult): Outcome<T> {
    if (result.isError) return { ok: false, guide: isErrorGuide(result.structuredContent) ? result.structuredContent : unknownGuide };
    return { ok: true, value: result.structuredContent as T };
  }

  async function act<T>(name: string, args: Record<string, unknown>): Promise<Outcome<T>> {
    try {
      return outcome<T>(await callTool(name, args));
    } catch {
      return { ok: false, guide: unknownGuide };
    }
  }

  async function actQuietly<T>(name: string, args: Record<string, unknown>): Promise<Outcome<T>> {
    try {
      const result = await client.callTool(name, args);
      if (!result.isError) absorb(result);
      await settle();
      return outcome<T>(result);
    } catch {
      return { ok: false, guide: unknownGuide };
    }
  }

  async function revisionBoundPageAction(name: HumanCallAction, id: string): Promise<Outcome<StatusObject>> {
    const revision = state.requests.find((request) => request.callRequestId === id)?.revision;
    if (!Number.isInteger(revision)) {
      return {
        ok: false,
        guide: {
          ...unknownGuide,
          headline: 'The call details are still refreshing',
          fix: 'Wait a moment, then try again.',
        },
      };
    }
    const key = `${name}:${id}:${revision}`;
    const invocationId = pageActionInvocations.get(key) ?? crypto.randomUUID();
    pageActionInvocations.set(key, invocationId);

    if (options.callActionApi) {
      try {
        const payload = await options.callActionApi.act(name, id, revision as number, invocationId);
        const status = fromCallRequest(payload);
        if (!status || !isStatusObject(status)) {
          throw new Error('JooVoice returned an incomplete call response.');
        }
        upsert(status);
        state.lastGuide = null;
        pageActionInvocations.delete(key);
        await settle();
        return { ok: true, value: status };
      } catch (error) {
        if (error instanceof CallActionApiError) {
          const current = fromCallRequest(error.current);
          if (current && isStatusObject(current)) upsert(current);
          const guide = error.toGuide();
          state.lastGuide = guide;
          await settle();
          return { ok: false, guide };
        }
        state.lastGuide = unknownGuide;
        await settle();
        return { ok: false, guide: unknownGuide };
      }
    }

    try {
      const result = await callTool(name, { callRequestId: id, revision, invocationId });
      pageActionInvocations.delete(key);
      return outcome<StatusObject>(result);
    } catch {
      // Keep the same invocation id: a click after an ambiguous network failure is a replay.
      return { ok: false, guide: unknownGuide };
    }
  }

  async function refresh(): Promise<void> {
    absorb(await client.callTool('check_account', {}));
    if (state.account?.loggedIn) {
      if (options.welcomeCallApi) {
        try {
          mergeWelcomeCall(await options.welcomeCallApi.read());
        } catch {
          // Keep the account projection visible; page actions still report route errors directly.
        }
      }
      if (state.catalog.some((tool) => tool.name === 'check_featured_actions')) {
        try {
          const featured = await client.callTool('check_featured_actions', {});
          if (!featured.isError && isFeaturedActionsState(featured.structuredContent)) {
            state.featuredActions = featured.structuredContent.items.length > 0 ? featured.structuredContent : null;
          } else {
            state.featuredActions = null;
          }
        } catch {
          state.featuredActions = null;
        }
      } else {
        state.featuredActions = null;
      }
      absorb(await client.callTool('list_call_requests', {}));
      for (const request of state.requests) {
        if (request.status === 'needs_answers' && !request.questions) {
          absorb(await client.callTool('check_call_request', { callRequestId: request.callRequestId }));
        }
      }
    }
    await settle();
    scheduleWelcomePoll();
  }

  function refreshAfterRecovery(): void {
    if (closed || recoveryRefresh) return;
    const attempt = (async () => {
      try {
        state.catalog = await client.listTools();
        await refresh();
      } catch {
        subscriptions?.setStreamDown(true);
      }
    })();
    recoveryRefresh = attempt;
    void attempt.finally(() => {
      if (recoveryRefresh === attempt) recoveryRefresh = null;
    });
  }

  function guideForWelcomeError(error: unknown): ErrorGuide {
    return error instanceof WelcomeCallApiError ? error.toGuide() : unknownGuide;
  }

  async function accountOutcome(response: WelcomeCallResponse): Promise<Outcome<AccountObject>> {
    mergeWelcomeCall(response);
    await settle();
    scheduleWelcomePoll();
    return state.account ? { ok: true, value: state.account } : { ok: false, guide: unknownGuide };
  }

  async function requestWelcomeCall(phone: string): Promise<Outcome<AccountObject>> {
    if (!options.welcomeCallApi) return act<AccountObject>('request_welcome_call', { phone });
    try {
      return await accountOutcome(await options.welcomeCallApi.request(phone));
    } catch (error) {
      if (error instanceof WelcomeCallApiError && error.isExhaustion) {
        if (state.account) {
          const { welcomeCall: _unavailableWelcomeCall, ...account } = state.account;
          state.account = account;
          state.lastGuide = null;
          clearWelcomePoll();
          await settle();
          return { ok: true, value: account };
        }
      }
      const guide = guideForWelcomeError(error);
      state.lastGuide = guide;
      emit();
      return { ok: false, guide };
    }
  }

  async function acknowledgeWelcomeCall(): Promise<Outcome<AccountObject>> {
    if (!options.welcomeCallApi) return act<AccountObject>('acknowledge_welcome_call', {});
    try {
      return await accountOutcome(await options.welcomeCallApi.acknowledge());
    } catch (error) {
      const guide = guideForWelcomeError(error);
      state.lastGuide = guide;
      emit();
      return { ok: false, guide };
    }
  }

  const booth: Booth = {
    state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    async connect() {
      state.phase = 'connecting';
      state.error = null;
      emit();
      try {
        await client.connect();
        client.onError(() => {
          subscriptions?.setStreamDown(true);
        });
        client.onClose(() => {
          subscriptions?.setStreamDown(true);
        });
        subscriptions = createSubscriptions({
          client,
          onStatus: (status) => {
            upsert(status);
            void settle();
          },
          onAccount: (account) => {
            const welcomeCall = state.account?.welcomeCall;
            state.account = options.welcomeCallApi && welcomeCall
              ? { ...account, welcomeCall }
              : account;
            void settle();
          },
          onStreamChange: (down) => {
            const recovered = state.streamDown && !down;
            state.streamDown = down;
            emit();
            if (recovered) refreshAfterRecovery();
          },
          timers: options.timers,
        });
        state.catalog = await client.listTools();
        await refresh();
        if (state.phase === 'connecting') state.phase = 'ready';
      } catch (cause) {
        if (state.phase === 'connecting') {
          state.phase = 'error';
          state.error = cause instanceof Error ? cause.message : String(cause);
        }
      }
      emit();
    },
    refresh,
    callTool,
    createCallRequest: (input) => act<StatusObject>('create_call_request', { ...input, invocationId: input.invocationId ?? crypto.randomUUID() }),
    answerQuestions: (id, questionSetId, answers, additionalDetails) =>
      act<StatusObject>('answer_call_questions', {
        callRequestId: id,
        questionSetId,
        answers,
        ...(additionalDetails ? { additionalDetails } : {}),
      }),
    cancel: (id, reason) => act<StatusObject>('cancel_call_request', { callRequestId: id, ...(reason ? { reason } : {}) }),
    placeCall: (id) => revisionBoundPageAction('place_call_request', id),
    retryCall: (id) => revisionBoundPageAction('retry_call_request', id),
    requestReportBack: (id) => act<StatusObject>('request_report_back_call', { callRequestId: id }),
    requestWelcomeCall,
    acknowledgeWelcomeCall,
    checkFeaturedActions: () => actQuietly<FeaturedActionsState>('check_featured_actions', {}),
    triggerFeaturedAction: (id, values, expectedRevision) =>
      actQuietly<FeaturedActionsState>('trigger_featured_action', {
        actionId: id,
        values,
        expectedRevision,
        invocationId: crypto.randomUUID(),
      }),
    prefill: (answers) => act<Record<string, unknown>>('prefill_interview', { answers }),
    markUnauthorized() {
      state.phase = 'unauthorized';
      emit();
    },
    async close() {
      if (closed) return;
      closed = true;
      clearWelcomePoll();
      stopInbox();
      await subscriptions?.close();
      inbox.apply([]);
      try {
        await client.close();
      } catch {
        /* already closed */
      }
      state.phase = 'idle';
      emit();
      listeners.clear();
    },
  };
  return booth;
}

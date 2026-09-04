import { isAccountObject, isStatusObject, needsUpdates, type AccountObject, type StatusObject } from '../types.ts';
import type { BoothClient } from './client.ts';
import { accountUri, callRequestIdFromUri, callRequestUri } from './uris.ts';

export interface SubscriptionsOptions {
  client: Pick<BoothClient, 'subscribe' | 'unsubscribe' | 'readResource' | 'onResourceUpdated' | 'callTool'>;
  onStatus: (status: StatusObject) => void;
  onAccount?: (account: AccountObject) => void;
  onStreamChange?: (down: boolean) => void;
  timers?: { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
  recoveryAfterSeconds?: number;
}

export interface Subscriptions {
  readonly streamDown: boolean;
  readonly subscribed: ReadonlySet<string>;
  sync(requests: StatusObject[]): Promise<void>;
  setStreamDown(down: boolean): void;
  close(): Promise<void>;
}

const defaultTimers = {
  set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clear: (handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSubscriptions(options: SubscriptionsOptions): Subscriptions {
  const { client } = options;
  const timers = options.timers ?? defaultTimers;
  const recoveryAfterSeconds = options.recoveryAfterSeconds ?? 5;
  const subscribed = new Set<string>();
  const polls = new Map<string, unknown>();
  let recoveryTimer: unknown;
  let latest: StatusObject[] = [];
  let streamDown = false;
  let closed = false;

  const stopUpdates = client.onResourceUpdated((uri) => {
    changeStreamState(false);
    void refresh(uri);
  });

  async function refresh(uri: string): Promise<void> {
    if (closed) return;
    try {
      const text = await client.readResource(uri);
      const parsed: unknown = JSON.parse(text);
      if (uri === accountUri) {
        if (isAccountObject(parsed)) options.onAccount?.(parsed);
      } else if (isStatusObject(parsed)) {
        options.onStatus(parsed);
      }
    } catch {
      /* the next update or poll re-reads */
    }
  }

  async function subscribeTo(uri: string): Promise<boolean> {
    try {
      await client.subscribe(uri);
      subscribed.add(uri);
      return true;
    } catch {
      return false;
    }
  }

  async function unsubscribeFrom(uri: string): Promise<void> {
    subscribed.delete(uri);
    try {
      await client.unsubscribe(uri);
    } catch {
      /* already gone */
    }
  }

  function clearPoll(id: string): void {
    const handle = polls.get(id);
    if (handle !== undefined) timers.clear(handle);
    polls.delete(id);
  }

  function schedulePolls(): void {
    for (const id of [...polls.keys()]) clearPoll(id);
    if (!streamDown) return;
    for (const request of latest) {
      if (!needsUpdates(request) || request.checkAfterSeconds === undefined) continue;
      const id = request.callRequestId;
      polls.set(
        id,
        timers.set(() => {
          polls.delete(id);
          void poll(id);
        }, request.checkAfterSeconds * 1000),
      );
    }
  }

  function clearRecovery(): void {
    if (recoveryTimer !== undefined) timers.clear(recoveryTimer);
    recoveryTimer = undefined;
  }

  function scheduleRecovery(): void {
    clearRecovery();
    if (!streamDown || closed) return;
    recoveryTimer = timers.set(() => {
      recoveryTimer = undefined;
      void restoreSubscriptions();
    }, recoveryAfterSeconds * 1000);
  }

  async function poll(id: string): Promise<void> {
    if (closed) return;
    try {
      const result = await client.callTool('check_call_request', { callRequestId: id });
      if (!result.isError && isStatusObject(result.structuredContent)) options.onStatus(result.structuredContent);
    } catch {
      /* the next sync reschedules */
    }
  }

  function changeStreamState(down: boolean): void {
    if (streamDown === down) return;
    streamDown = down;
    options.onStreamChange?.(down);
    schedulePolls();
    scheduleRecovery();
  }

  function setStreamDown(down: boolean): void {
    if (down) subscribed.clear();
    changeStreamState(down);
  }

  async function restoreSubscriptions(): Promise<void> {
    if (closed) return;
    let healthy = true;
    if (!subscribed.has(accountUri) && !(await subscribeTo(accountUri))) healthy = false;

    const wanted = new Set(latest.filter(needsUpdates).map((request) => callRequestUri(request.callRequestId)));
    for (const uri of wanted) {
      if (!subscribed.has(uri) && !(await subscribeTo(uri))) healthy = false;
    }

    if (healthy) changeStreamState(false);
    else {
      changeStreamState(true);
      scheduleRecovery();
    }
  }

  return {
    get streamDown() {
      return streamDown;
    },
    subscribed,
    async sync(requests) {
      if (closed) return;
      latest = requests;
      const wanted = new Set(requests.filter(needsUpdates).map((request) => callRequestUri(request.callRequestId)));
      for (const uri of [...subscribed]) {
        if (uri !== accountUri && !wanted.has(uri)) await unsubscribeFrom(uri);
      }
      await restoreSubscriptions();
      schedulePolls();
    },
    setStreamDown,
    async close() {
      closed = true;
      stopUpdates();
      clearRecovery();
      for (const id of [...polls.keys()]) clearPoll(id);
      for (const uri of [...subscribed]) {
        if (callRequestIdFromUri(uri) || uri === accountUri) await unsubscribeFrom(uri);
      }
    },
  };
}

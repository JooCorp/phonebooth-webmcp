import { describe, expect, test } from 'bun:test';
import { createSubscriptions } from './subscriptions.ts';
import { accountUri, callRequestUri } from './uris.ts';
import type { StatusObject, ToolCallResult } from '../types.ts';

function status(id: string, state: StatusObject['status'], checkAfterSeconds?: number): StatusObject {
  return {
    callRequestId: id,
    status: state,
    meaning: 'm',
    sayToOwner: 's',
    next: [],
    request: 'r',
    calleeAlias: 'a',
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    ...(checkAfterSeconds !== undefined ? { checkAfterSeconds } : {}),
  };
}

function fakeClient(options: { failSubscribe?: boolean; failSubscribeCount?: number } = {}) {
  const subscribed = new Set<string>();
  const listeners = new Set<(uri: string) => void>();
  const resources = new Map<string, unknown>();
  const calls: string[] = [];
  let subscribeFailures = options.failSubscribeCount ?? 0;
  return {
    subscribed,
    resources,
    calls,
    emit(uri: string) {
      for (const listener of listeners) listener(uri);
    },
    async subscribe(uri: string) {
      if (options.failSubscribe || subscribeFailures > 0) {
        subscribeFailures -= 1;
        throw new Error('no subscriptions');
      }
      subscribed.add(uri);
    },
    async unsubscribe(uri: string) {
      subscribed.delete(uri);
    },
    async readResource(uri: string) {
      return JSON.stringify(resources.get(uri));
    },
    onResourceUpdated(listener: (uri: string) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
      calls.push(`${name}:${String(args.callRequestId)}`);
      return { content: [], structuredContent: status(String(args.callRequestId), 'calling', 15) as unknown as Record<string, unknown> };
    },
  };
}

function fakeTimers() {
  const pending: { fn: () => void; ms: number }[] = [];
  return {
    pending,
    set: (fn: () => void, ms: number) => {
      const entry = { fn, ms };
      pending.push(entry);
      return entry;
    },
    clear: (handle: unknown) => {
      const index = pending.indexOf(handle as { fn: () => void; ms: number });
      if (index >= 0) pending.splice(index, 1);
    },
    async fire() {
      const entries = pending.splice(0);
      for (const entry of entries) entry.fn();
      await Bun.sleep(0);
    },
    async fireDelay(ms: number) {
      const entries = pending.filter((entry) => entry.ms === ms);
      for (const entry of entries) {
        const index = pending.indexOf(entry);
        if (index >= 0) pending.splice(index, 1);
        entry.fn();
      }
      await Bun.sleep(0);
    },
  };
}

describe('subscriptions', () => {
  test('subscribes to active requests and the account, unsubscribes terminal ones, and re-reads on updates', async () => {
    const client = fakeClient();
    const seen: StatusObject[] = [];
    const accounts: unknown[] = [];
    const subs = createSubscriptions({ client, onStatus: (entry) => seen.push(entry), onAccount: (account) => accounts.push(account) });
    await subs.sync([status('cr_a', 'thinking', 5), status('cr_b', 'queued')]);
    expect([...client.subscribed]).toEqual([accountUri, callRequestUri('cr_a'), callRequestUri('cr_b')]);
    expect(subs.streamDown).toBe(false);

    client.resources.set(callRequestUri('cr_a'), status('cr_a', 'needs_answers'));
    client.emit(callRequestUri('cr_a'));
    await Bun.sleep(0);
    expect(seen.map((entry) => entry.status)).toEqual(['needs_answers']);

    client.resources.set(accountUri, { loggedIn: true, blockers: [] });
    client.emit(accountUri);
    await Bun.sleep(0);
    expect(accounts).toHaveLength(1);

    await subs.sync([status('cr_a', 'done'), status('cr_b', 'queued')]);
    expect([...client.subscribed]).toEqual([accountUri, callRequestUri('cr_b')]);
    await subs.close();
    expect(client.subscribed.size).toBe(0);
  });

  test('keeps a terminal failure subscribed while the server asks for reconciliation', async () => {
    const client = fakeClient();
    const subs = createSubscriptions({ client, onStatus: () => undefined });
    const reconciling = status('cr_reconciling', 'not_placed', 1);
    reconciling.next = [{
      tool: 'check_call_request',
      args: { callRequestId: reconciling.callRequestId },
      after: 'checkAfterSeconds',
    }];
    await subs.sync([reconciling]);
    expect(client.subscribed.has(callRequestUri('cr_reconciling'))).toBe(true);

    await subs.sync([status('cr_reconciling', 'not_placed')]);
    expect(client.subscribed.has(callRequestUri('cr_reconciling'))).toBe(false);
    await subs.close();
  });

  test('polls with checkAfterSeconds while the stream is down', async () => {
    const client = fakeClient();
    const timers = fakeTimers();
    const seen: StatusObject[] = [];
    const changes: boolean[] = [];
    const subs = createSubscriptions({ client, onStatus: (entry) => seen.push(entry), onStreamChange: (down) => changes.push(down), timers, recoveryAfterSeconds: 2 });
    await subs.sync([status('cr_a', 'thinking', 5), status('cr_b', 'needs_answers'), status('cr_c', 'done')]);
    expect(timers.pending).toHaveLength(0);

    subs.setStreamDown(true);
    expect(changes).toEqual([true]);
    expect(timers.pending.map((entry) => entry.ms).sort((left, right) => left - right)).toEqual([2000, 5000]);
    await timers.fireDelay(5000);
    expect(client.calls).toEqual(['check_call_request:cr_a']);
    expect(seen[0]?.status).toBe('calling');

    expect(timers.pending.map((entry) => entry.ms)).toEqual([2000]);
    await timers.fireDelay(2000);
    await subs.sync([seen[0]!]);
    expect(changes).toEqual([true, false]);
    expect(timers.pending).toHaveLength(0);
    await subs.close();
  });

  test('marks the stream down when subscribing fails', async () => {
    const client = fakeClient({ failSubscribe: true });
    const timers = fakeTimers();
    const subs = createSubscriptions({ client, onStatus: () => undefined, timers, recoveryAfterSeconds: 2 });
    await subs.sync([status('cr_a', 'thinking', 5)]);
    expect(subs.streamDown).toBe(true);
    expect(timers.pending.map((entry) => entry.ms).sort((left, right) => left - right)).toEqual([2000, 5000]);
    await subs.close();
  });

  test('retries failed subscriptions and leaves polling fallback without user action', async () => {
    const client = fakeClient({ failSubscribeCount: 1 });
    const timers = fakeTimers();
    const changes: boolean[] = [];
    const subs = createSubscriptions({
      client,
      onStatus: () => undefined,
      onStreamChange: (down) => changes.push(down),
      timers,
      recoveryAfterSeconds: 2,
    });

    await subs.sync([status('cr_a', 'thinking', 5)]);
    expect(subs.streamDown).toBe(true);
    expect(client.subscribed.has(accountUri)).toBe(false);
    expect(client.subscribed.has(callRequestUri('cr_a'))).toBe(true);

    await timers.fireDelay(2000);
    expect(subs.streamDown).toBe(false);
    expect([...client.subscribed]).toEqual([callRequestUri('cr_a'), accountUri]);
    expect(changes).toEqual([true, false]);
    expect(timers.pending).toHaveLength(0);
    await subs.close();
  });
});

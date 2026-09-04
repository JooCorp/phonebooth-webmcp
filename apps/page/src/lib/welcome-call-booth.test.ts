import { describe, expect, test } from 'bun:test';
import { createToolInbox } from '@joovoice/state-as-tools';
import { createBooth } from './booth.ts';
import type { BoothClient } from './mcp/client.ts';
import type { AccountObject, WelcomeCallState } from './types.ts';
import type { WelcomeCallApi, WelcomeCallResponse } from './welcome-call-api.ts';
import { WelcomeCallApiError } from './welcome-call-api.ts';
import { accountUri } from './mcp/uris.ts';

const account: AccountObject = {
  loggedIn: true,
  accountState: 'active',
  welcomeCall: { status: 'required', phoneAlias: null, acknowledged: false },
  blockers: [],
  phone: { verified: true, alias: '+1 •••• 0123', reportBackConsented: false },
  urls: { web: 'https://joovoice.test', dashboard: 'https://booth.test', connect: 'https://joovoice.test/agents' },
  sayToOwner: 'Ready.',
  next: [],
  docs: [],
};

function fakeMcpClient(calls: string[]): BoothClient & { emitAccount(account: AccountObject): void } {
  let onResourceUpdated: ((uri: string) => void) | null = null;
  let accountResource = structuredClone(account);
  return {
    kind: 'http',
    connect: async () => undefined,
    listTools: async () => [],
    callTool: async (name) => {
      calls.push(name);
      return name === 'check_account'
        ? { content: [], structuredContent: structuredClone(account) as unknown as Record<string, unknown> }
        : { content: [], structuredContent: { items: [] } };
    },
    readResource: async (uri) => uri === accountUri ? JSON.stringify(accountResource) : '',
    subscribe: async () => undefined,
    unsubscribe: async () => undefined,
    onResourceUpdated: (listener) => {
      onResourceUpdated = listener;
      return () => {
        onResourceUpdated = null;
      };
    },
    onError: () => () => undefined,
    onClose: () => () => undefined,
    close: async () => undefined,
    emitAccount(nextAccount) {
      accountResource = structuredClone(nextAccount);
      onResourceUpdated?.(accountUri);
    },
  };
}

function fakeTimers() {
  const pending: Array<{ fn: () => void; ms: number }> = [];
  return {
    pending,
    set(fn: () => void, ms: number) {
      const entry = { fn, ms };
      pending.push(entry);
      return entry;
    },
    clear(handle: unknown) {
      const index = pending.indexOf(handle as { fn: () => void; ms: number });
      if (index >= 0) pending.splice(index, 1);
    },
    async fireNext() {
      const entry = pending.shift();
      if (!entry) throw new Error('No timer is pending.');
      entry.fn();
      await Bun.sleep(5);
    },
  };
}

function response(welcomeCall: WelcomeCallState): WelcomeCallResponse {
  return { welcomeCall, checkAfterSeconds: 1 };
}

describe('Phonebooth welcome-call adapter', () => {
  test('keeps page-only actions off MCP and polls JooVoice until completion', async () => {
    const mcpCalls: string[] = [];
    const apiCalls: string[] = [];
    const timers = fakeTimers();
    const reads = [
      response({ status: 'required', phoneAlias: null, acknowledged: false }),
      response({ status: 'calling', phoneAlias: '+1 •••• 0123', acknowledged: false }),
      response({ status: 'complete', phoneAlias: '+1 •••• 0123', acknowledged: false }),
    ];
    const api: WelcomeCallApi = {
      read: async () => {
        apiCalls.push('read');
        return reads.shift()!;
      },
      request: async (phone) => {
        apiCalls.push(`request:${phone}`);
        return response({ status: 'requested', phoneAlias: '+1 •••• 0123', acknowledged: false });
      },
      acknowledge: async () => {
        apiCalls.push('acknowledge');
        return response({ status: 'complete', phoneAlias: '+1 •••• 0123', acknowledged: true });
      },
    };
    const mcp = fakeMcpClient(mcpCalls);
    const booth = createBooth({
      client: mcp,
      inbox: createToolInbox(null),
      welcomeCallApi: api,
      timers,
    });

    await booth.connect();
    expect(booth.state.account?.welcomeCall?.status).toBe('required');
    await booth.requestWelcomeCall('+14155550123');
    expect(booth.state.account?.welcomeCall?.status).toBe('requested');
    expect(timers.pending.map(entry => entry.ms)).toEqual([1000]);

    mcp.emitAccount({
      ...account,
      welcomeCall: { status: 'required', phoneAlias: null, acknowledged: false },
      sayToOwner: 'A newer account field arrived over MCP.',
    });
    await Bun.sleep(5);
    expect(booth.state.account?.sayToOwner).toBe('A newer account field arrived over MCP.');
    expect(booth.state.account?.welcomeCall?.status).toBe('requested');

    await timers.fireNext();
    expect(booth.state.account?.welcomeCall?.status).toBe('calling');
    await timers.fireNext();
    expect(booth.state.account?.welcomeCall?.status).toBe('complete');
    expect(timers.pending).toHaveLength(0);

    await booth.acknowledgeWelcomeCall();
    expect(booth.state.account?.welcomeCall?.acknowledged).toBe(true);
    expect(apiCalls).toEqual(['read', 'request:+14155550123', 'read', 'read', 'acknowledge']);
    expect(mcpCalls).toEqual(['check_account', 'list_call_requests']);
    await booth.close();
  });

  test('removes the welcome capability on exhaustion and stops on a retryable not-placed state', async () => {
    const timers = fakeTimers();
    let readState: WelcomeCallState = { status: 'required', phoneAlias: null, acknowledged: false };
    let exhaust = true;
    const api: WelcomeCallApi = {
      read: async () => response(readState),
      request: async () => {
        if (exhaust) {
          exhaust = false;
          readState = { status: 'complete', phoneAlias: '+1 •••• 0123', acknowledged: false };
          throw new WelcomeCallApiError(409, {
            code: 'welcome_call_exhausted',
            text: 'You can continue to Phonebooth.',
          });
        }
        return response({ status: 'requested', phoneAlias: '+1 •••• 0123', acknowledged: false });
      },
      acknowledge: async () => response({ ...readState, acknowledged: true }),
    };
    const booth = createBooth({
      client: fakeMcpClient([]),
      inbox: createToolInbox(null),
      welcomeCallApi: api,
      timers,
    });

    await booth.connect();
    const exhausted = await booth.requestWelcomeCall('+14155550123');
    expect(exhausted.ok).toBe(true);
    expect(booth.state.account?.welcomeCall).toBeUndefined();
    expect(timers.pending).toHaveLength(0);

    readState = {
      status: 'required',
      phoneAlias: '+1 •••• 0123',
      acknowledged: false,
      reason: { code: 'not_answered', text: 'The number did not answer.' },
    };
    await booth.refresh();
    expect(booth.state.account?.welcomeCall?.reason?.text).toBe('The number did not answer.');
    expect(timers.pending).toHaveLength(0);
    await booth.close();
  });
});

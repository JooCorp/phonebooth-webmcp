import { describe, expect, test } from 'bun:test';
import { createToolInbox, type ModelContextLike, type ToolSpec } from '@joovoice/state-as-tools';
import { script } from '@phonebooth/sim-mcp';
import { createBooth } from './booth.ts';
import type { BoothClient } from './mcp/client.ts';
import { createSimulationClient } from './mcp/simulation-client.ts';
import type { StatusObject } from './types.ts';

function fakeModelContext() {
  const registered = new Map<string, ToolSpec>();
  const context: ModelContextLike = {
    registerTool(tool, options) {
      registered.set(tool.name, tool);
      options?.signal?.addEventListener('abort', () => {
        if (registered.get(tool.name) === tool) registered.delete(tool.name);
      });
    },
  };
  return { context, registered };
}

async function setup() {
  let now = Date.parse('2026-09-03T10:00:00.000Z');
  const client = createSimulationClient({ autoTick: false, now: () => now });
  const model = fakeModelContext();
  const inbox = createToolInbox(model.context);
  const booth = createBooth({ client, inbox });
  const snapshots: string[] = [];
  booth.subscribe((state) => snapshots.push(state.phase));
  await booth.connect();
  return {
    booth,
    client,
    model,
    snapshots,
    async advance(seconds: number) {
      now += seconds * 1000;
      client.simulation.tick();
      await Bun.sleep(5);
    },
    tool(name: string) {
      const tool = model.registered.get(name);
      if (!tool) throw new Error(`not registered: ${name} (have ${[...model.registered.keys()].join(', ')})`);
      return tool;
    },
    async close() {
      await booth.close();
    },
  };
}

describe('the page store against the simulated MCP server', () => {
  test('hides the optional canvas when its service returns a 404-equivalent failure', async () => {
    const client: BoothClient = {
      kind: 'http',
      connect: async () => undefined,
      listTools: async () => [
        { name: 'check_account', description: '', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
        { name: 'check_featured_actions', description: '', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
        { name: 'list_call_requests', description: '', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
      ],
      callTool: async (name) => {
        if (name === 'check_featured_actions') throw new Error('404 Not Found');
        if (name === 'list_call_requests') return { content: [], structuredContent: { items: [] } };
        return {
          content: [],
          structuredContent: {
            loggedIn: true,
            accountState: 'active',
            blockers: [],
            phone: { verified: true, alias: null, reportBackConsented: false },
            urls: { web: '/', dashboard: '/', connect: '/' },
            sayToOwner: 'Ready.',
            next: [],
            docs: [],
          },
        };
      },
      readResource: async () => '',
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
      onResourceUpdated: () => () => undefined,
      onError: () => () => undefined,
      onClose: () => () => undefined,
      close: async () => undefined,
    };
    const booth = createBooth({ client, inbox: createToolInbox(null) });
    await booth.connect();
    expect(booth.state.phase).toBe('ready');
    expect(booth.state.featuredActions).toBeNull();
    expect(booth.state.lastGuide).toBeNull();
    expect(booth.state.error).toBeNull();
    await booth.close();
  });

  test('registers the catalog, then drives a call end to end through the agent-facing tools', async () => {
    const session = await setup();
    const { booth } = session;
    expect(booth.state.phase).toBe('ready');
    expect(booth.state.account?.loggedIn).toBe(true);
    expect(booth.state.requests).toEqual([]);
    expect(booth.state.catalog.every((tool) => tool.outputSchema !== undefined)).toBe(true);
    const staticNames = booth.state.agentSees.filter((tool) => tool.groupId === 'static').map((tool) => tool.name);
    expect(staticNames).toHaveLength(11);
    expect(booth.state.featuredActions).toBeNull();
    expect(staticNames).not.toContain('place_call_request');
    expect(staticNames).not.toContain('retry_call_request');
    expect(staticNames).not.toContain('request_welcome_call');
    expect(booth.state.agentSees.find((tool) => tool.name === 'check_call_request')?.annotations.untrustedContentHint).toBe(true);

    const created = (await session.tool('create_call_request').execute({ request: 'Ask one thing', phone: '+6591234512', ownerTimezone: 'Asia/Singapore' })) as {
      structuredContent: StatusObject;
    };
    expect(created.structuredContent.status).toBe('thinking');
    const id = created.structuredContent.callRequestId;
    const short = id.replace(/^cr_/, '').slice(0, 6);
    expect(booth.state.requests.map((request) => request.callRequestId)).toEqual([id]);
    expect(session.model.registered.has(`wait_for_${short}`)).toBe(true);
    expect(session.model.registered.has(`cancel_${short}`)).toBe(true);

    await session.advance(script.thinkingSeconds);
    expect(booth.state.requests[0]?.status).toBe('needs_answers');
    expect(booth.state.requests[0]?.questions).toHaveLength(2);
    const answer = session.tool(`answer_questions_${short}`);
    expect(answer.description).toContain('needs_answers');
    await answer.execute({ q_name: 'A name', q_later: 'ch_a' });
    expect(booth.state.requests[0]?.status).toBe('queued');
    expect(session.model.registered.has(`answer_questions_${short}`)).toBe(false);

    await session.advance(script.queuedSeconds);
    expect(booth.state.requests[0]?.status).toBe('calling');
    expect(booth.state.requests[0]?.live?.phase).toBe('dialing');
    expect(session.model.registered.has(`cancel_${short}`)).toBe(false);
    await session.advance(script.phases[0]!.until);
    expect(booth.state.requests[0]?.live?.phase).toBe('ringing');
    expect(session.tool(`wait_for_${short}`).description).toContain('ringing');

    await session.advance(script.callSeconds);
    const finished = booth.state.requests[0]!;
    expect(finished.status).toBe('done');
    expect(finished.result?.untrustedContent).toBe(true);
    expect(finished.result?.facts).toHaveLength(2);
    const read = session.tool(`read_result_${short}`);
    expect(read.annotations?.untrustedContentHint).toBe(true);
    const result = (await read.execute({})) as { structuredContent: StatusObject };
    expect(result.structuredContent.result?.summary).toBeString();
    expect(session.model.registered.has(`wait_for_${short}`)).toBe(false);

    await session.tool(`call_me_with_result_${short}`).execute({});
    expect(booth.state.requests[0]?.reportBack?.status).toBe('queued');
    expect(session.model.registered.has(`call_me_with_result_${short}`)).toBe(false);
    await session.advance(script.reportBackQueuedSeconds);
    expect(booth.state.requests[0]?.reportBack?.status).toBe('calling');
    await session.advance(script.reportBackDoneSeconds - script.reportBackQueuedSeconds);
    expect(booth.state.requests[0]?.reportBack?.status).toBe('done');
    await session.close();
    expect(session.model.registered.size).toBe(0);
  });

  test('call-now requests wait for the human button and cancel works before the call', async () => {
    const session = await setup();
    const { booth } = session;
    const created = await booth.createCallRequest({ request: 'Ask one thing', phone: '+6591234512', ownerTimezone: 'Asia/Singapore', callNow: true });
    if (!created.ok) throw new Error(created.guide.headline);
    const id = created.value.callRequestId;
    expect(created.value.callNow).toBe(true);
    await session.advance(script.thinkingSeconds);
    const asking = booth.state.requests[0]!;
    const answered = await booth.answerQuestions(id, asking.questionSetId!, [{ id: 'q_name', value: 'A name' }]);
    expect(answered.ok).toBe(true);
    await session.advance(script.queuedSeconds * 2);
    expect(booth.state.requests[0]?.status).toBe('queued');
    expect(session.model.registered.has('place_call_request')).toBe(false);
    const placed = await booth.placeCall(id);
    expect(placed.ok && placed.value.status).toBe('calling');

    const unanswered = session.client.simulation.store.simulateNotAnswered(id);
    if (!unanswered.ok) throw new Error(unanswered.guide.headline);
    await Bun.sleep(5);
    expect(booth.state.requests[0]).toMatchObject({
      callRequestId: id,
      status: 'not_placed',
      retryNow: true,
      attemptSummary: { count: 1 },
    });
    expect(session.model.registered.has('retry_call_request')).toBe(false);
    const retried = await booth.retryCall(id);
    expect(retried.ok && retried.value).toMatchObject({
      callRequestId: id,
      status: 'calling',
      attemptSummary: { count: 2 },
    });

    const other = await booth.createCallRequest({ request: 'Another', phone: '+6591234512', ownerTimezone: 'Asia/Singapore' });
    if (!other.ok) throw new Error(other.guide.headline);
    const cancelled = await booth.cancel(other.value.callRequestId, 'changed my mind');
    expect(cancelled.ok && cancelled.value.status).toBe('cancelled');
    const again = await booth.cancel(other.value.callRequestId);
    expect(again.ok).toBe(false);
    expect(booth.state.lastGuide?.kind).toBe('not_allowed_right_now');
    await session.close();
  });

  test('lets the human page request a welcome call while navigation follows account updates', async () => {
    const session = await setup();
    expect(session.booth.state.account?.welcomeCall?.status).toBe('required');
    expect(session.model.registered.has('request_welcome_call')).toBe(false);
    expect(session.model.registered.has('acknowledge_welcome_call')).toBe(false);

    const requested = await session.booth.requestWelcomeCall('+6591234512');
    expect(requested.ok && requested.value.welcomeCall?.status).toBe('requested');
    expect(session.booth.state.account?.welcomeCall?.phoneAlias).toBe('+65…12');

    await session.advance(script.welcomeCallRingingSeconds);
    expect(session.booth.state.account?.welcomeCall?.status).toBe('calling');
    await session.advance(script.welcomeCallSeconds - script.welcomeCallRingingSeconds);
    expect(session.booth.state.account?.welcomeCall?.status).toBe('complete');
    expect(session.booth.state.account?.welcomeCall?.acknowledged).toBe(false);

    const acknowledged = await session.booth.acknowledgeWelcomeCall();
    expect(acknowledged.ok && acknowledged.value.welcomeCall?.acknowledged).toBe(true);
    expect(session.booth.state.account?.welcomeCall?.acknowledged).toBe(true);
    await session.close();
  });

  test('lets the human page skip the welcome call before requesting it', async () => {
    const session = await setup();

    const skipped = await session.booth.acknowledgeWelcomeCall();
    expect(skipped.ok && skipped.value.welcomeCall).toEqual({
      status: 'required',
      phoneAlias: null,
      acknowledged: true,
    });
    expect(session.booth.state.account?.welcomeCall?.acknowledged).toBe(true);
    await session.close();
  });

  test('absorbs a real JooVoice list response before it reaches page state', async () => {
    let mcpPlacementCalls = 0;
    let apiPlacement: { action: string; revision: number } | undefined;
    const client: BoothClient = {
      kind: 'http',
      connect: async () => undefined,
      listTools: async () => [],
      callTool: async (name) => {
        if (name === 'place_call_request') mcpPlacementCalls += 1;
        return name === 'check_account'
          ? {
            content: [],
            structuredContent: {
              loggedIn: true,
              accountState: 'active',
              blockers: [],
              phone: { verified: false, alias: null, reportBackConsented: false },
              urls: { web: 'https://app.test', dashboard: 'https://booth.test', connect: 'https://app.test/agents' },
              sayToOwner: 'Ready.',
              next: [],
              docs: [],
            },
          }
          : {
            content: [],
            structuredContent: {
              schemaVersion: 'joovoice-call-request-list-v1',
              items: [{
                schemaVersion: 'joovoice-call-request-v1',
                callRequestId: 'cr_real_list_001',
                revision: 2,
                status: 'ready_for_review',
                meaning: 'The call is ready for your review.',
                sayToOwner: 'Review the call in Phonebooth.',
                request: 'Book a table for two.',
                callee: { display: '+65 •••• 4567' },
                createdAt: '2026-09-04T08:00:00.000Z',
                updatedAt: '2026-09-04T08:03:00.000Z',
                availableActions: [{ kind: 'review_and_call', revision: 2 }],
              }],
              nextCursor: null,
            },
          };
      },
      readResource: async () => '{}',
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
      onResourceUpdated: () => () => undefined,
      onError: () => () => undefined,
      onClose: () => () => undefined,
      close: async () => undefined,
    };
    const booth = createBooth({
      client,
      inbox: createToolInbox(null),
      callActionApi: {
        act: async (action, callRequestId, revision) => {
          apiPlacement = { action, revision };
          return {
            schemaVersion: 'joovoice-call-request-v1',
            callRequestId,
            revision: revision + 1,
            status: 'queued',
            meaning: 'The call is queued.',
            sayToOwner: 'The call will begin shortly.',
            request: 'Book a table for two.',
            callee: { display: '+65 •••• 4567' },
            createdAt: '2026-09-04T08:00:00.000Z',
            updatedAt: '2026-09-04T08:04:00.000Z',
            availableActions: [{ kind: 'check_status', afterSeconds: 1 }],
          };
        },
      },
    });

    await booth.connect();
    expect(booth.state.requests).toEqual([expect.objectContaining({
      callRequestId: 'cr_real_list_001',
      status: 'ready_for_review',
      calleeAlias: '+65 •••• 4567',
      callNow: true,
    })]);
    const placed = await booth.placeCall('cr_real_list_001');
    expect(placed.ok && placed.value.status).toBe('queued');
    expect(apiPlacement).toEqual({ action: 'place_call_request', revision: 2 });
    expect(mcpPlacementCalls).toBe(0);
    await booth.close();
  });

  test('renders blockers from a gated account and refuses to create', async () => {
    const client = createSimulationClient({ autoTick: false, account: { blockers: ['phone_unverified'], phone: { verified: false, alias: null, reportBackConsented: false } } });
    const booth = createBooth({ client, inbox: createToolInbox(null) });
    await booth.connect();
    expect(booth.state.account?.accountState).toBe('setup_required');
    expect(booth.state.account?.blockers[0]?.url).toContain('gate=phone');
    const refused = await booth.createCallRequest({ request: 'x', phone: '+6591234512', ownerTimezone: 'Asia/Singapore' });
    expect(refused.ok).toBe(false);
    expect(booth.state.lastGuide?.kind).toBe('owner_action_required');
    await booth.close();
  });

  test('re-reads the catalog and service projections after subscription recovery', async () => {
    const pending: Array<{ fn: () => void; ms: number }> = [];
    const timers = {
      set(fn: () => void, ms: number) {
        const entry = { fn, ms };
        pending.push(entry);
        return entry;
      },
      clear(handle: unknown) {
        const index = pending.indexOf(handle as { fn: () => void; ms: number });
        if (index >= 0) pending.splice(index, 1);
      },
    };
    let closeListener: () => void = () => undefined;
    let catalogVersion = 1;
    let accountReads = 0;
    const client: BoothClient = {
      kind: 'http',
      connect: async () => undefined,
      listTools: async () => [
        { name: 'check_account', description: '', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
        { name: 'list_call_requests', description: '', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } },
        ...(catalogVersion === 2
          ? [{ name: 'new_read_tool', description: 'A tool added while disconnected.', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }]
          : []),
      ],
      callTool: async (name) => {
        if (name === 'check_account') {
          accountReads += 1;
          return {
            content: [],
            structuredContent: {
              loggedIn: true,
              accountState: 'active',
              blockers: [],
              phone: { verified: false, alias: null, reportBackConsented: false },
              urls: { web: '/', dashboard: '/', connect: '/' },
              sayToOwner: `Account read ${accountReads}.`,
              next: [],
              docs: [],
            },
          };
        }
        return { content: [], structuredContent: { items: [] } };
      },
      readResource: async () => '{}',
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
      onResourceUpdated: () => () => undefined,
      onError: () => () => undefined,
      onClose(listener) {
        closeListener = listener;
        return () => undefined;
      },
      close: async () => undefined,
    };
    const booth = createBooth({ client, inbox: createToolInbox(null), timers });

    await booth.connect();
    expect(accountReads).toBe(1);
    expect(booth.state.catalog.map((tool) => tool.name)).not.toContain('new_read_tool');

    catalogVersion = 2;
    closeListener();
    expect(booth.state.streamDown).toBe(true);
    const recovery = pending.find((entry) => entry.ms === 5_000);
    expect(recovery).toBeDefined();
    recovery!.fn();
    await Bun.sleep(5);

    expect(booth.state.streamDown).toBe(false);
    expect(accountReads).toBe(2);
    expect(booth.state.catalog.map((tool) => tool.name)).toContain('new_read_tool');
    expect(booth.state.agentSees.map((tool) => tool.name)).toContain('new_read_tool');
    await booth.close();
  });
});

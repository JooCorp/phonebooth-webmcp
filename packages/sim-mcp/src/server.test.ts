import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { catalogNames, pageOnlyToolNames } from './catalog.ts';
import { createSimulatedServer, resourceUris } from './server.ts';
import { script } from './store.ts';
import type { AccountObject, ErrorGuide, StatusObject } from './types.ts';

async function connect(startAt = Date.parse('2026-09-03T10:00:00.000Z')) {
  let now = startAt;
  const sim = createSimulatedServer({ autoTick: false, now: () => now });
  const transport = await sim.connect();
  const client = new Client({ name: 'test-page', version: '0.0.0' });
  await client.connect(transport);
  return {
    sim,
    client,
    advance(seconds: number) {
      now += seconds * 1000;
      sim.tick();
    },
    async close() {
      await client.close();
      await sim.close();
    },
  };
}

function structured<T>(result: unknown): T {
  return (result as { structuredContent?: unknown }).structuredContent as T;
}

function base() {
  return { request: 'Ask one thing', phone: '+6591234512', ownerTimezone: 'Asia/Singapore' };
}

describe('simulated MCP server over the in-memory transport', () => {
  test('lists the catalog with output schemas and the page-only tool', async () => {
    const session = await connect();
    const { tools } = await session.client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual([...catalogNames, ...pageOnlyToolNames]);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
    const check = tools.find((tool) => tool.name === 'check_call_request')!;
    expect(check.annotations?.readOnlyHint).toBe(true);
    expect((check._meta as Record<string, unknown>).untrustedContentHint).toBe(true);
    expect((tools.find((tool) => tool.name === 'request_welcome_call')?._meta as Record<string, unknown>).pageOnly).toBe(true);
    await session.close();
  });

  test('runs a call from creation to result with subscriptions and waits', async () => {
    const session = await connect();
    const updates: string[] = [];
    session.client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
      updates.push(notification.params.uri);
    });

    const account = structured<AccountObject>(await session.client.callTool({ name: 'check_account', arguments: {} }));
    expect(account.loggedIn).toBe(true);
    expect(account.accountState).toBe('active');
    expect(account.welcomeCall.status).toBe('required');
    expect(account.sayToOwner).toContain('REALLY try the welcome call');
    expect(account.sayToOwner).toContain('validate your number');
    expect(account.sayToOwner).toContain('country code');

    const created = structured<StatusObject>(await session.client.callTool({ name: 'create_call_request', arguments: base() }));
    expect(created.status).toBe('thinking');
    const uri = resourceUris.callRequest(created.callRequestId);
    await session.client.subscribeResource({ uri });

    const waiting = session.client.callTool({ name: 'wait_for_call_request', arguments: { callRequestId: created.callRequestId, maxWaitSeconds: 1 } });
    await Bun.sleep(10);
    session.advance(script.thinkingSeconds);
    const asking = structured<StatusObject>(await waiting);
    expect(asking.status).toBe('needs_answers');
    expect(asking.changed).toBe(true);
    await Bun.sleep(0);
    expect(updates).toContain(uri);

    const read = await session.client.readResource({ uri });
    const fromResource = JSON.parse((read.contents[0] as { text: string }).text) as StatusObject;
    expect(fromResource.questionSetId).toBe(asking.questionSetId);

    const queued = structured<StatusObject>(
      await session.client.callTool({
        name: 'answer_call_questions',
        arguments: {
          callRequestId: created.callRequestId,
          questionSetId: asking.questionSetId,
          answers: [{ id: 'q_name', value: 'A name' }],
          additionalDetails: 'Please ask for a quiet table.',
        },
      }),
    );
    expect(queued.status).toBe('queued');

    session.advance(script.queuedSeconds);
    const calling = structured<StatusObject>(await session.client.callTool({ name: 'check_call_request', arguments: { callRequestId: created.callRequestId } }));
    expect(calling.status).toBe('calling');
    expect(calling.live?.phase).toBe('dialing');

    session.advance(script.callSeconds);
    const finished = structured<StatusObject>(await session.client.callTool({ name: 'check_call_request', arguments: { callRequestId: created.callRequestId } }));
    expect(finished.status).toBe('done');
    expect(finished.result?.untrustedContent).toBe(true);

    const list = structured<{ items: StatusObject[] }>(await session.client.callTool({ name: 'list_call_requests', arguments: {} }));
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.status).toBe('done');

    const resources = await session.client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toContain(uri);
    const templates = await session.client.listResourceTemplates();
    expect(templates.resourceTemplates[0]?.uriTemplate).toBe(resourceUris.callRequestTemplate);
    await session.client.unsubscribeResource({ uri });
    await session.close();
  });

  test('returns guides as isError results and replays invocation ids', async () => {
    const session = await connect();
    const missing = await session.client.callTool({ name: 'check_call_request', arguments: { callRequestId: 'cr_missing' } });
    expect(missing.isError).toBe(true);
    expect(structured<ErrorGuide>(missing).kind).toBe('fix_the_request');

    const incomplete = await session.client.callTool({ name: 'create_call_request', arguments: { request: 'x' } });
    expect(incomplete.isError).toBe(true);

    const first = structured<StatusObject>(await session.client.callTool({ name: 'create_call_request', arguments: { ...base(), invocationId: 'inv-1' } }));
    const again = structured<StatusObject>(await session.client.callTool({ name: 'create_call_request', arguments: { ...base(), invocationId: 'inv-1' } }));
    expect(again.callRequestId).toBe(first.callRequestId);

    const cancelled = structured<StatusObject>(await session.client.callTool({ name: 'cancel_call_request', arguments: { callRequestId: first.callRequestId, reason: 'changed my mind' } }));
    expect(cancelled.status).toBe('cancelled');
    const twice = await session.client.callTool({ name: 'cancel_call_request', arguments: { callRequestId: first.callRequestId } });
    expect(twice.isError).toBe(true);
    expect(structured<ErrorGuide>(twice).kind).toBe('not_allowed_right_now');
    await session.close();
  });

  test('places a call-now request only through the page-only tool', async () => {
    const session = await connect();
    const created = structured<StatusObject>(await session.client.callTool({ name: 'create_call_request', arguments: { ...base(), callNow: true } }));
    session.advance(script.thinkingSeconds);
    const asking = structured<StatusObject>(await session.client.callTool({ name: 'check_call_request', arguments: { callRequestId: created.callRequestId } }));
    const queued = structured<StatusObject>(await session.client.callTool({
      name: 'answer_call_questions',
      arguments: { callRequestId: created.callRequestId, questionSetId: asking.questionSetId, answers: [{ id: 'q_name', value: 'A name' }] },
    }));
    session.advance(script.queuedSeconds * 2);
    expect(structured<StatusObject>(await session.client.callTool({ name: 'check_call_request', arguments: { callRequestId: created.callRequestId } })).status).toBe('queued');
    const placed = structured<StatusObject>(await session.client.callTool({
      name: 'place_call_request',
      arguments: { callRequestId: created.callRequestId, revision: queued.revision, invocationId: 'place-1' },
    }));
    expect(placed.status).toBe('calling');
    await session.close();
  });

  test('retries the same logical call only after a simulated never-connected outcome', async () => {
    const session = await connect();
    const created = structured<StatusObject>(await session.client.callTool({
      name: 'create_call_request',
      arguments: { ...base(), callNow: true },
    }));
    session.advance(script.thinkingSeconds);
    const asking = structured<StatusObject>(await session.client.callTool({
      name: 'check_call_request',
      arguments: { callRequestId: created.callRequestId },
    }));
    const queued = structured<StatusObject>(await session.client.callTool({
      name: 'answer_call_questions',
      arguments: {
        callRequestId: created.callRequestId,
        questionSetId: asking.questionSetId,
        answers: [{ id: 'q_name', value: 'A name' }],
      },
    }));
    await session.client.callTool({
      name: 'place_call_request',
      arguments: { callRequestId: created.callRequestId, revision: queued.revision, invocationId: 'place-before-no-answer' },
    });
    const failed = session.sim.store.simulateNotAnswered(created.callRequestId);
    if (!failed.ok) throw new Error(failed.guide.headline);
    expect(failed.value).toMatchObject({
      callRequestId: created.callRequestId,
      status: 'not_placed',
      retryNow: true,
      attemptSummary: { count: 1 },
      next: [{ tool: 'retry_call_request' }],
    });

    const retried = structured<StatusObject>(await session.client.callTool({
      name: 'retry_call_request',
      arguments: { callRequestId: created.callRequestId, revision: failed.value.revision, invocationId: 'retry-1' },
    }));
    expect(retried).toMatchObject({
      callRequestId: created.callRequestId,
      status: 'calling',
      attemptSummary: { count: 2 },
    });
    const replay = structured<StatusObject>(await session.client.callTool({
      name: 'retry_call_request',
      arguments: { callRequestId: created.callRequestId, revision: failed.value.revision, invocationId: 'retry-1' },
    }));
    expect(replay).toEqual(retried);

    const stale = await session.client.callTool({
      name: 'retry_call_request',
      arguments: { callRequestId: created.callRequestId, revision: failed.value.revision, invocationId: 'retry-stale' },
    });
    expect(stale.isError).toBe(true);
    await session.close();
  });

  test('does not manufacture a retry once the simulated call has connected', async () => {
    const session = await connect();
    const created = structured<StatusObject>(await session.client.callTool({
      name: 'create_call_request',
      arguments: base(),
    }));
    session.advance(script.thinkingSeconds);
    const asking = structured<StatusObject>(await session.client.callTool({
      name: 'check_call_request',
      arguments: { callRequestId: created.callRequestId },
    }));
    await session.client.callTool({
      name: 'answer_call_questions',
      arguments: {
        callRequestId: created.callRequestId,
        questionSetId: asking.questionSetId,
        answers: [{ id: 'q_name', value: 'A name' }],
      },
    });
    session.advance(script.queuedSeconds);
    session.advance(script.phases[1]!.until);
    const connected = structured<StatusObject>(await session.client.callTool({
      name: 'check_call_request',
      arguments: { callRequestId: created.callRequestId },
    }));
    expect(connected.live?.phase).toBe('connected');
    const refused = session.sim.store.simulateNotAnswered(created.callRequestId);
    expect(refused.ok).toBe(false);
    await session.close();
  });

  test('projects the welcome call lifecycle through the subscribed account resource', async () => {
    const session = await connect();
    const updates: string[] = [];
    session.client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
      updates.push(notification.params.uri);
    });
    await session.client.subscribeResource({ uri: resourceUris.account });

    const requested = structured<AccountObject>(
      await session.client.callTool({ name: 'request_welcome_call', arguments: { phone: '+6591234512' } }),
    );
    expect(requested.welcomeCall).toEqual({ status: 'requested', phoneAlias: '+65…12', acknowledged: false });
    await Bun.sleep(0);
    expect(updates).toContain(resourceUris.account);

    session.advance(script.welcomeCallRingingSeconds);
    const calling = structured<AccountObject>(await session.client.callTool({ name: 'check_account', arguments: {} }));
    expect(calling.welcomeCall.status).toBe('calling');

    session.advance(script.welcomeCallSeconds - script.welcomeCallRingingSeconds);
    const complete = structured<AccountObject>(await session.client.callTool({ name: 'check_account', arguments: {} }));
    expect(complete.welcomeCall.status).toBe('complete');
    expect(complete.welcomeCall.acknowledged).toBe(false);

    const acknowledged = structured<AccountObject>(
      await session.client.callTool({ name: 'acknowledge_welcome_call', arguments: {} }),
    );
    expect(acknowledged.welcomeCall).toEqual({ status: 'complete', phoneAlias: '+65…12', acknowledged: true });
    await session.close();
  });

  test('lets the person skip before requesting a welcome call', async () => {
    const session = await connect();

    const skipped = structured<AccountObject>(
      await session.client.callTool({ name: 'acknowledge_welcome_call', arguments: {} }),
    );
    expect(skipped.welcomeCall).toEqual({ status: 'required', phoneAlias: null, acknowledged: true });
    expect(skipped.sayToOwner).not.toContain('REALLY try the welcome call');

    const requestAfterSkip = structured<AccountObject>(
      await session.client.callTool({ name: 'request_welcome_call', arguments: { phone: '+6591234512' } }),
    );
    expect(requestAfterSkip.welcomeCall).toEqual(skipped.welcomeCall);
    await session.close();
  });

  test('serves the account and docs resources', async () => {
    const session = await connect();
    const account = await session.client.readResource({ uri: resourceUris.account });
    expect(JSON.parse((account.contents[0] as { text: string }).text).loggedIn).toBe(true);
    for (const uri of resourceUris.docs) {
      const doc = await session.client.readResource({ uri });
      expect((doc.contents[0] as { text: string }).text.length).toBeGreaterThan(0);
    }
    await expect(session.client.readResource({ uri: 'joovoice://nope' })).rejects.toThrow();
    await session.close();
  });
});

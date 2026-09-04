import { describe, expect, test } from 'bun:test';
import { activeRequests, answersFromArgs, buildToolGroups, questionParameters, shortId, stateLine } from './groups.ts';
import type { Question, StatusObject, ToolCallResult, ToolDescriptor } from '../types.ts';

const catalog: ToolDescriptor[] = [
  { name: 'check_account', description: 'Check.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'create_call_request', description: 'Create.', inputSchema: { type: 'object', properties: {} }, annotations: {} },
  { name: 'request_welcome_call', description: 'Page only.', inputSchema: { type: 'object', properties: {} }, annotations: {} },
  { name: 'acknowledge_welcome_call', description: 'Page only.', inputSchema: { type: 'object', properties: {} }, annotations: {} },
  { name: 'place_call_request', description: 'Page only.', inputSchema: { type: 'object', properties: {} }, annotations: {} },
  { name: 'retry_call_request', description: 'Page only.', inputSchema: { type: 'object', properties: {} }, annotations: {} },
];

const catalogWithCancel: ToolDescriptor[] = [
  ...catalog,
  { name: 'cancel_call_request', description: 'Cancel.', inputSchema: { type: 'object', properties: {} }, annotations: {} },
];

function status(overrides: Partial<StatusObject> & { callRequestId: string; status: StatusObject['status'] }): StatusObject {
  return {
    meaning: 'Placeholder meaning.',
    sayToOwner: 'Placeholder line.',
    next: [],
    request: 'Ask one thing',
    calleeAlias: '+65…12',
    createdAt: '2026-09-03T10:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

const questions: StatusObject['questions'] = [
  { id: 'q_name', label: 'Whose name?', required: true, kind: 'text', sensitivity: 'sensitive', input: { kind: 'text' }, whyWeAsk: 'Placeholder.' },
  { id: 'q_later', label: 'Later ok?', required: false, kind: 'choice', sensitivity: 'public', input: { kind: 'single_choice', choices: [{ id: 'ch_a', label: 'A' }, { id: 'ch_b', label: 'B', followup: { kind: 'text', placeholder: 'Say what works' } }] } },
];

function recorder() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const call = async (name: string, args: Record<string, unknown>): Promise<ToolCallResult> => {
    calls.push({ name, args });
    return { content: [] };
  };
  return { calls, call };
}

describe('tool groups', () => {
  test('static group carries the catalog without page-only tools and forwards calls', async () => {
    const { calls, call } = recorder();
    const groups = buildToolGroups({ catalog, requests: [], call });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe('static');
    expect(groups[0]?.tools.map((tool) => tool.name)).toEqual(['check_account', 'create_call_request']);
    await groups[0]!.tools[1]!.execute({ request: 'x' });
    expect(calls).toEqual([{ name: 'create_call_request', args: { request: 'x' } }]);
  });

  test('per-request tools follow the state and fill the id in', async () => {
    const { calls, call } = recorder();
    const asking = status({ callRequestId: 'cr_abcdef12', status: 'needs_answers', questionSetId: 'qs_1', questions, reportBack: { available: true, status: 'none', tool: 'request_report_back_call', once: true } });
    const groups = buildToolGroups({ catalog: catalogWithCancel, requests: [asking], call });
    const group = groups.find((entry) => entry.id === 'cr_abcdef12')!;
    const names = group.tools.map((tool) => tool.name);
    expect(names).toEqual(['answer_questions_abcdef', 'wait_for_abcdef', 'cancel_abcdef', 'call_me_with_result_abcdef']);
    for (const tool of group.tools) expect(tool.description).toContain(stateLine(asking));

    const answer = group.tools[0]!;
    expect((answer.inputSchema as { required: string[] }).required).toEqual(['q_name']);
    expect(Object.keys((answer.inputSchema as { properties: Record<string, unknown> }).properties)).toEqual([
      'q_name',
      'q_later',
      'q_later__followup',
      'additionalDetails',
    ]);
    await answer.execute({ q_name: 'A name', q_later: 'ch_b', q_later__followup: '  Before 9 pm.  ', additionalDetails: '  Please pronounce the name carefully.  ' });
    await group.tools[1]!.execute({ maxWaitSeconds: 5 });
    await group.tools[2]!.execute({ reason: 'no longer needed' });
    await group.tools[3]!.execute({});
    expect(calls).toEqual([
      {
        name: 'answer_call_questions',
        args: {
          callRequestId: 'cr_abcdef12',
          questionSetId: 'qs_1',
          answers: [{ id: 'q_name', value: 'A name' }, { id: 'q_later', choiceId: 'ch_b', note: 'Before 9 pm.' }],
          additionalDetails: 'Please pronounce the name carefully.',
        },
      },
      { name: 'wait_for_call_request', args: { callRequestId: 'cr_abcdef12', maxWaitSeconds: 5 } },
      { name: 'cancel_call_request', args: { callRequestId: 'cr_abcdef12', reason: 'no longer needed' } },
      { name: 'request_report_back_call', args: { callRequestId: 'cr_abcdef12' } },
    ]);
  });

  test('leaves the answer tool to the declarative form when the browser supports it', () => {
    const { call } = recorder();
    const asking = status({ callRequestId: 'cr_abcdef12', status: 'needs_answers', questionSetId: 'qs_1', questions });
    const groups = buildToolGroups({ catalog: catalogWithCancel, requests: [asking], call, declarativeForms: true });
    expect(groups[1]?.tools.map((tool) => tool.name)).toEqual(['wait_for_abcdef', 'cancel_abcdef']);
  });

  test('done requests expose an untrusted read tool and calling requests only a wait', async () => {
    const { calls, call } = recorder();
    const finished = status({
      callRequestId: 'cr_done0001',
      status: 'done',
      result: { objectiveSucceeded: true, summary: 's', facts: [], endedBecause: 'completed', durationSeconds: 1, untrustedContent: true },
    });
    const calling = status({ callRequestId: 'cr_live0001', status: 'calling', live: { phase: 'ringing', seconds: 3 } });
    const groups = buildToolGroups({ catalog, requests: [finished, calling], call });
    const done = groups.find((entry) => entry.id === 'cr_done0001')!;
    expect(done.tools.map((tool) => tool.name)).toEqual(['read_result_done00']);
    expect(done.tools[0]?.annotations?.untrustedContentHint).toBe(true);
    await done.tools[0]!.execute({});
    expect(calls[0]).toEqual({ name: 'check_call_request', args: { callRequestId: 'cr_done0001' } });
    const live = groups.find((entry) => entry.id === 'cr_live0001')!;
    expect(live.tools.map((tool) => tool.name)).toEqual(['wait_for_live00']);
    expect(live.state).toContain('ringing');
  });

  test('gates ready-for-review cancellation on the server tool list without exposing placement', () => {
    const ready = status({ callRequestId: 'cr_review001', status: 'ready_for_review', callNow: true });
    const unsupported = buildToolGroups({ catalog, requests: [ready], call: recorder().call });
    const unsupportedNames = unsupported.find((entry) => entry.id === ready.callRequestId)!.tools.map((tool) => tool.name);
    const supported = buildToolGroups({ catalog: catalogWithCancel, requests: [ready], call: recorder().call });
    const supportedNames = supported.find((entry) => entry.id === ready.callRequestId)!.tools.map((tool) => tool.name);

    expect(unsupportedNames).toEqual(['wait_for_review']);
    expect(supportedNames).toEqual(['wait_for_review', 'cancel_review']);
    expect(supportedNames.some((name) => /place|approve|review_and_call/u.test(name))).toBe(false);
  });

  test('caps active requests at five most recent and drops terminal failures', () => {
    const requests = Array.from({ length: 8 }, (_, index) =>
      status({ callRequestId: `cr_req${index}`, status: index === 0 ? 'cancelled' : 'queued', updatedAt: `2026-09-03T10:0${index}:00.000Z`, window: { text: 'w' } }),
    );
    const active = activeRequests(requests);
    expect(active).toHaveLength(5);
    expect(active.map((request) => request.callRequestId)).toEqual(['cr_req7', 'cr_req6', 'cr_req5', 'cr_req4', 'cr_req3']);
    const groups = buildToolGroups({ catalog, requests, call: recorder().call });
    expect(groups).toHaveLength(6);
  });

  test('helpers', () => {
    expect(shortId('cr_abcdefghij')).toBe('abcdef');
    expect(answersFromArgs(questions!, { q_name: '', q_later: 'ch_b' })).toEqual([{ id: 'q_later', choiceId: 'ch_b' }]);
  });

  test('matches Voice field kinds while keeping restricted answers person-only', () => {
    const formats: Question[] = [
      { id: 'q_text', label: 'Text', required: true, kind: 'text', sensitivity: 'public', input: { kind: 'text', placeholder: 'A short answer' } },
      { id: 'q_phone', label: 'Phone', required: false, kind: 'phone', sensitivity: 'sensitive', input: { kind: 'text' } },
      { id: 'q_address', label: 'Address', required: false, kind: 'address', sensitivity: 'public', input: { kind: 'text', multiline: true } },
      { id: 'q_date', label: 'Date', required: false, kind: 'date', sensitivity: 'public', input: { kind: 'text' } },
      { id: 'q_card', label: 'Card', required: true, kind: 'text', sensitivity: 'restricted', input: { kind: 'text' } },
      { id: 'q_choice', label: 'Choice', required: false, kind: 'choice', sensitivity: 'public', input: { kind: 'single_choice', choices: [{ id: 'ch_other', label: 'Other', followup: { kind: 'text' } }] } },
    ];
    const { properties, required } = questionParameters(formats);
    expect(Object.keys(properties)).toEqual([
      'q_text',
      'q_phone',
      'q_address',
      'q_date',
      'q_choice',
      'q_choice__followup',
      'additionalDetails',
    ]);
    expect(required).toEqual(['q_text']);
    expect(answersFromArgs(formats, {
      q_text: 'Hello',
      q_card: '4111111111111111',
      q_choice: 'ch_other',
      q_choice__followup: 'Something specific',
    })).toEqual([
      { id: 'q_text', value: 'Hello' },
      { id: 'q_choice', choiceId: 'ch_other', note: 'Something specific' },
    ]);
  });
});

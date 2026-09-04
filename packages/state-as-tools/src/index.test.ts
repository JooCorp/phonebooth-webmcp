import { describe, expect, test } from 'bun:test';
import { createToolInbox, type ModelContextLike, type ToolGroup, type ToolSpec } from './index.ts';

interface Registration {
  tool: ToolSpec;
  signal?: AbortSignal;
  aborted: () => boolean;
}

function fakeModelContext(): { mc: ModelContextLike; registrations: Registration[] } {
  const registrations: Registration[] = [];
  const mc: ModelContextLike = {
    registerTool(tool, options) {
      registrations.push({
        tool,
        signal: options?.signal,
        aborted: () => options?.signal?.aborted === true,
      });
      return () => undefined;
    },
  };
  return { mc, registrations };
}

function tool(name: string, description = 'x'): ToolSpec {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties: {} },
    execute: () => ({ ok: true }),
  };
}

function group(id: string, state: string, tools: ToolSpec[]): ToolGroup {
  return { id, state, tools };
}

describe('createToolInbox', () => {
  test('registers each tool of a group with a signal', () => {
    const { mc, registrations } = fakeModelContext();
    const inbox = createToolInbox(mc);
    inbox.apply([group('cr_1', 'thinking', [tool('wait_for_cr1'), tool('cancel_cr1')])]);
    expect(registrations.map((entry) => entry.tool.name)).toEqual(['wait_for_cr1', 'cancel_cr1']);
    expect(registrations[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(inbox.list()).toHaveLength(2);
  });

  test('aborts the previous registration when the state changes', () => {
    const { mc, registrations } = fakeModelContext();
    const inbox = createToolInbox(mc);
    inbox.apply([group('cr_1', 'thinking', [tool('wait_for_cr1')])]);
    inbox.apply([group('cr_1', 'needs_answers', [tool('answer_questions_cr1')])]);
    expect(registrations[0]?.aborted()).toBe(true);
    expect(registrations[1]?.aborted()).toBe(false);
    expect(inbox.list().map((entry) => entry.name)).toEqual(['answer_questions_cr1']);
  });

  test('does not re-register when nothing changed', () => {
    const { mc, registrations } = fakeModelContext();
    const inbox = createToolInbox(mc);
    const stable = () => group('cr_1', 'queued', [tool('wait_for_cr1', 'same line')]);
    inbox.apply([stable()]);
    inbox.apply([stable()]);
    expect(registrations).toHaveLength(1);
  });

  test('re-registers when only the description changes', () => {
    const { mc, registrations } = fakeModelContext();
    const inbox = createToolInbox(mc);
    inbox.apply([group('cr_1', 'calling', [tool('wait_for_cr1', 'ringing')])]);
    inbox.apply([group('cr_1', 'calling', [tool('wait_for_cr1', 'connected')])]);
    expect(registrations).toHaveLength(2);
    expect(registrations[0]?.aborted()).toBe(true);
  });

  test('drops groups that are no longer in the stream', () => {
    const { mc, registrations } = fakeModelContext();
    const inbox = createToolInbox(mc);
    inbox.apply([group('cr_1', 'queued', [tool('wait_for_cr1')]), group('cr_2', 'queued', [tool('wait_for_cr2')])]);
    inbox.apply([group('cr_2', 'queued', [tool('wait_for_cr2')])]);
    expect(registrations[0]?.aborted()).toBe(true);
    expect(registrations[1]?.aborted()).toBe(false);
    expect(inbox.list().map((entry) => entry.groupId)).toEqual(['cr_2']);
  });

  test('notifies onchange listeners and stops after unsubscribe', () => {
    const { mc } = fakeModelContext();
    const inbox = createToolInbox(mc);
    const seen: number[] = [];
    const off = inbox.onchange((tools) => seen.push(tools.length));
    inbox.apply([group('cr_1', 'thinking', [tool('wait_for_cr1')])]);
    inbox.update(group('cr_1', 'needs_answers', [tool('answer_questions_cr1'), tool('cancel_cr1')]));
    off();
    inbox.remove('cr_1');
    expect(seen).toEqual([1, 2]);
  });

  test('falls back to provideContext when registerTool is absent', () => {
    const batches: string[][] = [];
    const mc: ModelContextLike = {
      provideContext(context) {
        batches.push(context.tools.map((entry) => entry.name));
      },
    };
    const inbox = createToolInbox(mc);
    inbox.apply([group('static', 'static', [tool('check_account')])]);
    inbox.update(group('cr_1', 'done', [tool('read_result_cr1')]));
    expect(batches).toEqual([['check_account'], ['check_account', 'read_result_cr1']]);
    expect(inbox.registered).toBe(true);
  });

  test('works with no model context and still lists tools', () => {
    const inbox = createToolInbox(null);
    inbox.apply([group('cr_1', 'done', [tool('read_result_cr1', 'result ready')])]);
    expect(inbox.registered).toBe(false);
    expect(inbox.list()).toEqual([
      {
        groupId: 'cr_1',
        state: 'done',
        name: 'read_result_cr1',
        description: 'result ready',
        annotations: {},
      },
    ]);
  });

  test('close aborts everything and ignores later updates', () => {
    const { mc, registrations } = fakeModelContext();
    const inbox = createToolInbox(mc);
    inbox.apply([group('cr_1', 'calling', [tool('wait_for_cr1')])]);
    inbox.close();
    expect(registrations[0]?.aborted()).toBe(true);
    inbox.apply([group('cr_2', 'calling', [tool('wait_for_cr2')])]);
    expect(registrations).toHaveLength(1);
    expect(inbox.list()).toEqual([]);
  });
});

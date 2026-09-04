import { describe, expect, test } from 'bun:test';
import { catalog, catalogNames, pageOnlyToolNames } from './catalog.ts';

const pinned: Record<string, string> = {
  check_account:
    'Check whether the person is signed in to JooVoice and what setup is still missing. Call this first.',
  check_featured_actions:
    'Check whether this account has an optional featured action panel and get its current presentation, availability, and allowance. Use this before suggesting or triggering a featured action.',
  trigger_featured_action:
    'Trigger one server-owned featured action. Check check_featured_actions first and do not trigger an item whose available value is false. Supply only the opaque action id and field values declared by that item; the service owns the action content and accepts no free-form instructions.',
  create_call_request:
    "Ask JooVoice to phone a business or a person and get an answer. Give the request in plain words, the phone number, and the person's timezone. You get a request id back within a second; JooVoice may then ask a few questions before calling.",
  answer_call_questions:
    'Answer the questions JooVoice asked for a call request. Partial answers are fine; required ones are marked.',
  check_call_request:
    'Get the current status, questions, or result of one call request. Cheap; use the checkAfterSeconds hint.',
  wait_for_call_request: 'Wait up to 25 seconds for a call request to change, then return its status.',
  list_call_requests: "List the person's recent call requests with their current status.",
  cancel_call_request: 'Cancel a call request that has not been placed yet.',
  request_report_back_call:
    'Ask JooVoice to phone the person on their own verified number with the result once the call is done. Once per request.',
  prefill_interview:
    'Fill in the setup answers you already know for the person. The person still reviews and submits.',
};

describe('tool catalog', () => {
  test('carries exactly the eleven contract tools in order', () => {
    expect(catalogNames).toEqual(Object.keys(pinned));
  });

  test('pins every description verbatim', () => {
    for (const entry of catalog) expect(entry.description).toBe(pinned[entry.name]!);
  });

  test('uses external-safe names', () => {
    for (const name of [...catalogNames, ...pageOnlyToolNames]) expect(name).toMatch(/^[a-z0-9_]+$/);
  });

  test('marks read-only and untrusted-content tools', () => {
    const byName = Object.fromEntries(catalog.map((entry) => [entry.name, entry.annotations]));
    for (const name of ['check_account', 'check_featured_actions', 'check_call_request', 'wait_for_call_request', 'list_call_requests']) {
      expect(byName[name]?.readOnlyHint).toBe(true);
    }
    for (const name of ['check_call_request', 'wait_for_call_request', 'list_call_requests']) {
      expect(byName[name]?.untrustedContentHint).toBe(true);
    }
    for (const name of ['trigger_featured_action', 'create_call_request', 'answer_call_questions', 'cancel_call_request', 'request_report_back_call', 'prefill_interview']) {
      expect(byName[name]?.readOnlyHint).toBeUndefined();
    }
  });

  test('declares object input schemas with the contract arguments', () => {
    const shape = Object.fromEntries(
      catalog.map((entry) => [entry.name, Object.keys((entry.inputSchema as { properties: Record<string, unknown> }).properties)]),
    );
    expect(shape.create_call_request).toEqual(['request', 'phone', 'ownerTimezone', 'deadline', 'earliest', 'calleeCity', 'callNow', 'invocationId']);
    expect(shape.trigger_featured_action).toEqual(['actionId', 'values', 'expectedRevision', 'invocationId']);
    expect(shape.answer_call_questions).toEqual(['callRequestId', 'questionSetId', 'answers', 'additionalDetails', 'invocationId']);
    expect(shape.wait_for_call_request).toEqual(['callRequestId', 'maxWaitSeconds']);
    expect(shape.list_call_requests).toEqual(['status', 'limit']);
    expect(shape.cancel_call_request).toEqual(['callRequestId', 'reason']);
    for (const entry of catalog) expect((entry.inputSchema as { type: string }).type).toBe('object');
  });

  test('keeps page-only tools out of the catalog', () => {
    expect(pageOnlyToolNames).toEqual([
      'request_welcome_call',
      'acknowledge_welcome_call',
      'place_call_request',
      'retry_call_request',
    ]);
    for (const name of pageOnlyToolNames) expect(catalogNames).not.toContain(name);
  });
});

import catalogJson from '../catalog.json';
import type { ToolCatalogEntry } from './types.ts';

export const catalog: readonly ToolCatalogEntry[] = catalogJson as ToolCatalogEntry[];

export const catalogNames: readonly string[] = catalog.map((entry) => entry.name);

export const pageOnlyTools: readonly ToolCatalogEntry[] = [
  {
    name: 'request_welcome_call',
    description:
      'Request the signed-in person’s one-time welcome call. Page only: a person enters their own number; the page never registers this tool with the browser.',
    inputSchema: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'The person’s phone number in E.164 format.' } },
      required: ['phone'],
    },
    annotations: {},
  },
  {
    name: 'acknowledge_welcome_call',
    description:
      'Acknowledge the welcome-call step and enter Phonebooth. Page only: a person may skip before requesting the call or continue after it completes; the page never registers this tool with the browser.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: {},
  },
  {
    name: 'place_call_request',
    description:
      'Place a queued call-now request. Page only: a person presses the button; the page never registers this tool with the browser.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        callRequestId: { type: 'string', description: 'The call request id.' },
        revision: { type: 'integer', description: 'The exact revision shown to the person.' },
        invocationId: { type: 'string', description: 'A stable idempotency key for this click.' },
      },
      required: ['callRequestId', 'revision'],
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'retry_call_request',
    description:
      'Retry a call that Voice confirms never connected. Page only: a person presses the button; the page never registers this tool with the browser agent.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        callRequestId: { type: 'string', description: 'The call request id.' },
        revision: { type: 'integer', description: 'The exact retryable revision shown to the person.' },
        invocationId: { type: 'string', description: 'A stable idempotency key for this click.' },
      },
      required: ['callRequestId', 'revision'],
    },
    annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
  },
];

export const pageOnlyToolNames: readonly string[] = pageOnlyTools.map((entry) => entry.name);

export function findTool(name: string): ToolCatalogEntry | undefined {
  return catalog.find((entry) => entry.name === name) ?? pageOnlyTools.find((entry) => entry.name === name);
}

import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { catalog, findTool, pageOnlyToolNames, pageOnlyTools } from './catalog.ts';
import { docs, guideCopy } from './copy.ts';
import { outputSchemaByTool } from './schemas.ts';
import { SimStore, script, shortId, type SimStoreOptions } from './store.ts';
import type {
  AccountObject,
  Answer,
  CallRequestList,
  CallRequestStatus,
  CreateCallRequestInput,
  ErrorGuide,
  FeaturedActionsState,
  Outcome,
  PrefillResult,
  StatusObject,
  ToolCatalogEntry,
} from './types.ts';

export const resourceUris = {
  account: 'joovoice://account',
  callRequest: (id: string): string => `joovoice://call-requests/${id}`,
  callRequestTemplate: 'joovoice://call-requests/{id}',
  docs: Object.keys(docs),
};

export function callRequestIdFromUri(uri: string): string | null {
  const match = /^joovoice:\/\/call-requests\/([A-Za-z0-9_]+)$/.exec(uri);
  return match?.[1] ?? null;
}

export interface SimulatedServerOptions extends SimStoreOptions {
  autoTick?: boolean;
}

export interface SimulatedServer {
  server: Server;
  store: SimStore;
  connect(): Promise<Transport>;
  tick(now?: number): void;
  close(): Promise<void>;
}

type ToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
};

function textOf(status: StatusObject): string {
  return `${status.callRequestId} is ${status.status}: ${status.meaning}`;
}

function done(status: StatusObject): ToolResult {
  return { content: [{ type: 'text', text: textOf(status) }], structuredContent: status as unknown as Record<string, unknown> };
}

function accountResult(account: AccountObject): ToolResult {
  return {
    content: [{ type: 'text', text: account.sayToOwner }],
    structuredContent: account as unknown as Record<string, unknown>,
  };
}

function featuredActionsResult(state: FeaturedActionsState): ToolResult {
  return {
    content: [{ type: 'text', text: state.sayToOwner }],
    structuredContent: state as unknown as Record<string, unknown>,
  };
}

function guideResult(guide: ErrorGuide): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `${guide.headline}. ${guide.fix}` }],
    structuredContent: guide as unknown as Record<string, unknown>,
  };
}

function fromOutcome<T>(outcome: Outcome<T>, render: (value: T) => ToolResult): ToolResult {
  return outcome.ok ? render(outcome.value) : guideResult(outcome.guide);
}

function badRequest(): ErrorGuide {
  return { kind: 'fix_the_request', headline: guideCopy.badRequest.headline, fix: guideCopy.badRequest.fix, next: [], sayToOwner: guideCopy.badRequest.say };
}

function typeMatches(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

function validateArgs(tool: ToolCatalogEntry, args: Record<string, unknown>): ErrorGuide | null {
  const schema = tool.inputSchema as {
    properties?: Record<string, { type?: unknown }>;
    required?: string[];
    additionalProperties?: boolean;
  };
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null) return badRequest();
  }
  for (const [key, value] of Object.entries(args)) {
    const property = schema.properties?.[key];
    if (!property && schema.additionalProperties === false) return badRequest();
    if (!property) continue;
    if (value !== undefined && !typeMatches(value, property.type)) return badRequest();
  }
  return null;
}

function asAnswers(value: unknown): Answer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || typeof (entry as Answer).id !== 'string') return [];
    const { id, value: answer, choiceId, skip } = entry as Answer;
    return [
      {
        id,
        ...(typeof answer === 'string' ? { value: answer } : {}),
        ...(typeof choiceId === 'string' ? { choiceId } : {}),
        ...(typeof skip === 'boolean' ? { skip } : {}),
      },
    ];
  });
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, entry]) => typeof entry === 'string')) as Record<string, string>;
}

export function createSimulatedServer(options: SimulatedServerOptions = {}): SimulatedServer {
  const store = new SimStore(options);
  const server = new Server(
    { name: 'joovoice-simulation', version: '0.1.0' },
    { capabilities: { tools: { listChanged: true }, resources: { subscribe: true, listChanged: true } } },
  );
  const subscriptions = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let connected = false;

  const notify = (promise: Promise<void>) => {
    promise.catch(() => undefined);
  };

  store.onRequest(({ request, created }) => {
    if (!connected) return;
    if (created) notify(server.sendResourceListChanged());
    const uri = resourceUris.callRequest(request.id);
    if (subscriptions.has(uri)) notify(server.sendResourceUpdated({ uri }));
  });
  store.onAccount(() => {
    if (connected && subscriptions.has(resourceUris.account)) notify(server.sendResourceUpdated({ uri: resourceUris.account }));
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...catalog, ...pageOnlyTools].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as { type: 'object'; properties?: Record<string, object>; required?: string[] },
      outputSchema: outputSchemaByTool[tool.name] as { type: 'object'; properties?: Record<string, object>; required?: string[] },
      annotations: tool.annotations,
      _meta: { ...tool.annotations, ...(pageOnlyToolNames.includes(tool.name) ? { pageOnly: true } : {}) },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = findTool(request.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    const invalid = validateArgs(tool, args);
    if (invalid) return guideResult(invalid);
    const id = typeof args.callRequestId === 'string' ? args.callRequestId : '';

    switch (tool.name) {
      case 'check_account': {
        const account: AccountObject = store.accountObject();
        return accountResult(account);
      }
      case 'check_featured_actions':
        return fromOutcome(store.checkFeaturedActions(), featuredActionsResult);
      case 'trigger_featured_action':
        return fromOutcome(
          store.triggerFeaturedAction(
            String(args.actionId ?? ''),
            asStringMap(args.values),
            Number(args.expectedRevision),
            String(args.invocationId ?? ''),
          ),
          featuredActionsResult,
        );
      case 'request_welcome_call':
        return fromOutcome(store.requestWelcomeCall(String(args.phone ?? '')), accountResult);
      case 'acknowledge_welcome_call':
        return fromOutcome(store.acknowledgeWelcomeCall(), accountResult);
      case 'create_call_request':
        return fromOutcome(store.create(args as unknown as CreateCallRequestInput), done);
      case 'answer_call_questions':
        return fromOutcome(
          store.answer(
            id,
            String(args.questionSetId ?? ''),
            asAnswers(args.answers),
            typeof args.invocationId === 'string' ? args.invocationId : undefined,
            typeof args.additionalDetails === 'string' ? args.additionalDetails : undefined,
          ),
          done,
        );
      case 'check_call_request':
        return fromOutcome(store.check(id), done);
      case 'wait_for_call_request': {
        const requested = typeof args.maxWaitSeconds === 'number' ? args.maxWaitSeconds : script.maxWaitSeconds;
        const token = extra._meta?.progressToken;
        let progress = 0;
        const onProgress = token === undefined
          ? undefined
          : (status: StatusObject) => {
              progress += 1;
              notify(extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress, message: textOf(status) } }));
            };
        return fromOutcome(await store.waitForChange(id, requested, onProgress), done);
      }
      case 'list_call_requests':
        return fromOutcome(
          store.list(typeof args.status === 'string' ? (args.status as CallRequestStatus) : undefined, typeof args.limit === 'number' ? args.limit : undefined),
          (list: CallRequestList) => ({
            content: [{ type: 'text', text: `${list.items.length} call request(s).` }],
            structuredContent: list as unknown as Record<string, unknown>,
          }),
        );
      case 'cancel_call_request':
        return fromOutcome(store.cancel(id), done);
      case 'request_report_back_call':
        return fromOutcome(store.reportBack(id), done);
      case 'prefill_interview':
        return fromOutcome(store.prefill(asStringMap(args.answers)), (result: PrefillResult) => ({
          content: [{ type: 'text', text: result.sayToOwner }],
          structuredContent: result as unknown as Record<string, unknown>,
        }));
      case 'place_call_request':
        return fromOutcome(
          store.place(
            id,
            typeof args.revision === 'number' ? args.revision : Number.NaN,
            typeof args.invocationId === 'string' ? args.invocationId : undefined,
          ),
          done,
        );
      case 'retry_call_request':
        return fromOutcome(
          store.retry(
            id,
            typeof args.revision === 'number' ? args.revision : Number.NaN,
            typeof args.invocationId === 'string' ? args.invocationId : undefined,
          ),
          done,
        );
      default:
        throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${tool.name}`);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: resourceUris.account, name: 'Account', mimeType: 'application/json' },
      ...resourceUris.docs.map((uri) => ({ uri, name: docs[uri]?.name ?? uri, mimeType: 'text/plain' })),
      ...[...store.requests.values()].map((request) => ({
        uri: resourceUris.callRequest(request.id),
        name: `Call request ${shortId(request.id)}`,
        mimeType: 'application/json',
      })),
    ],
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [{ uriTemplate: resourceUris.callRequestTemplate, name: 'Call request', mimeType: 'application/json' }],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === resourceUris.account) {
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(store.accountObject()) }] };
    }
    const doc = docs[uri];
    if (doc) return { contents: [{ uri, mimeType: 'text/plain', text: doc.text }] };
    const id = callRequestIdFromUri(uri);
    const found = id ? store.check(id) : null;
    if (!found || !found.ok) throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(found.value) }] };
  });

  server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    const { uri } = request.params;
    const known = uri === resourceUris.account || Boolean(docs[uri]) || Boolean(callRequestIdFromUri(uri) && store.requests.has(callRequestIdFromUri(uri) ?? ''));
    if (!known) throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
    subscriptions.add(uri);
    return {};
  });

  server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    subscriptions.delete(request.params.uri);
    return {};
  });

  return {
    server,
    store,
    async connect() {
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      connected = true;
      if (options.autoTick !== false && !timer) timer = setInterval(() => store.tick(), script.tickMs);
      return clientSide;
    },
    tick(now) {
      store.tick(now);
    },
    async close() {
      if (timer) clearInterval(timer);
      timer = null;
      connected = false;
      subscriptions.clear();
      await server.close();
    },
  };
}

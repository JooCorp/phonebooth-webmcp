import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { FetchLike, Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ToolCallResult, ToolDescriptor } from '../types.ts';

export type ClientKind = 'simulation' | 'http';

export interface BoothClient {
  readonly kind: ClientKind;
  connect(): Promise<void>;
  listTools(): Promise<ToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
  readResource(uri: string): Promise<string>;
  subscribe(uri: string): Promise<void>;
  unsubscribe(uri: string): Promise<void>;
  onResourceUpdated(listener: (uri: string) => void): () => void;
  onError(listener: (error: Error) => void): () => void;
  onClose(listener: () => void): () => void;
  close(): Promise<void>;
}

export interface Challenge {
  status: 401 | 403;
  header: string | null;
}

export interface HttpClientOptions {
  url: string;
  token: () => Promise<string | null> | string | null;
  onChallenge?: (challenge: Challenge) => void;
  fetch?: typeof fetch;
}

const clientInfo = { name: 'phonebooth-page', version: '0.1.0' };

function toDescriptor(tool: {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}): ToolDescriptor {
  const meta = tool._meta ?? {};
  const nestedAnnotations = meta.annotations && typeof meta.annotations === 'object'
    ? meta.annotations as Record<string, unknown>
    : {};
  const annotations: Record<string, unknown> = { ...nestedAnnotations, ...tool.annotations };
  for (const key of ['readOnlyHint', 'untrustedContentHint']) {
    if (annotations[key] === undefined && typeof meta[key] === 'boolean') annotations[key] = meta[key];
  }
  return {
    name: tool.name,
    description: tool.description ?? '',
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    annotations,
    ...(meta.pageOnly === true ? { pageOnly: true } : {}),
  };
}

function toResult(result: unknown): ToolCallResult {
  const raw = result as { content?: unknown; structuredContent?: unknown; isError?: boolean };
  return {
    content: Array.isArray(raw.content) ? (raw.content as ToolCallResult['content']) : [],
    ...(raw.structuredContent && typeof raw.structuredContent === 'object'
      ? { structuredContent: raw.structuredContent as Record<string, unknown> }
      : {}),
    ...(raw.isError ? { isError: true } : {}),
  };
}

export function createClientFromTransport(
  kind: ClientKind,
  openTransport: () => Promise<Transport>,
  afterClose?: () => Promise<void>,
): BoothClient {
  const updated = new Set<(uri: string) => void>();
  const errors = new Set<(error: Error) => void>();
  const closers = new Set<() => void>();
  let activeClient: Client | null = null;
  let connecting: Promise<Client> | null = null;
  let closed = false;

  function configuredClient(): Client {
    const client = new Client(clientInfo, { capabilities: {} });
    let disconnected = false;

    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (notification) => {
      for (const listener of updated) listener(notification.params.uri);
    });

    const markDisconnected = (error?: Error) => {
      if (disconnected || activeClient !== client) return;
      disconnected = true;
      activeClient = null;
      if (closed) return;
      if (error) {
        for (const listener of errors) listener(error);
      } else {
        for (const listener of closers) listener();
      }
    };

    client.onerror = (error) => markDisconnected(error);
    client.onclose = () => markDisconnected();
    return client;
  }

  async function connectedClient(): Promise<Client> {
    if (closed) throw new Error('The Phonebooth service connection is closed.');
    if (activeClient) return activeClient;
    if (connecting) return connecting;

    const candidate = configuredClient();
    const attempt = (async () => {
      try {
        await candidate.connect(await openTransport());
        if (closed) {
          await candidate.close().catch(() => undefined);
          throw new Error('The Phonebooth service connection is closed.');
        }
        activeClient = candidate;
        return candidate;
      } catch (cause) {
        await candidate.close().catch(() => undefined);
        throw cause;
      }
    })();
    connecting = attempt;
    void attempt.then(
      () => {
        if (connecting === attempt) connecting = null;
      },
      () => {
        if (connecting === attempt) connecting = null;
      },
    );
    return attempt;
  }

  async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = await connectedClient();
    try {
      return await run(client);
    } catch (cause) {
      if (activeClient === client) activeClient = null;
      throw cause;
    }
  }

  return {
    kind,
    async connect() {
      await connectedClient();
    },
    async listTools() {
      const { tools } = await withClient((client) => client.listTools());
      return tools.map((tool) => toDescriptor(tool as Parameters<typeof toDescriptor>[0]));
    },
    async callTool(name, args) {
      return toResult(await withClient((client) => client.callTool({ name, arguments: args })));
    },
    async readResource(uri) {
      const { contents } = await withClient((client) => client.readResource({ uri }));
      const first = contents[0] as { text?: string } | undefined;
      return first?.text ?? '';
    },
    async subscribe(uri) {
      await withClient((client) => client.subscribeResource({ uri }));
    },
    async unsubscribe(uri) {
      await withClient((client) => client.unsubscribeResource({ uri }));
    },
    onResourceUpdated(listener) {
      updated.add(listener);
      return () => {
        updated.delete(listener);
      };
    },
    onError(listener) {
      errors.add(listener);
      return () => {
        errors.delete(listener);
      };
    },
    onClose(listener) {
      closers.add(listener);
      return () => {
        closers.delete(listener);
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      const pending = connecting;
      connecting = null;
      await pending?.catch(() => undefined);
      const client = activeClient;
      activeClient = null;
      await client?.close().catch(() => undefined);
      await afterClose?.();
    },
  };
}

export function createHttpClient(options: HttpClientOptions): BoothClient {
  const baseFetch = options.fetch ?? fetch;
  const fetchWithBearer: FetchLike = async (input, init) => {
    const token = await options.token();
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await baseFetch(input, { ...init, headers });
    if (response.status === 401 || response.status === 403) {
      options.onChallenge?.({ status: response.status, header: response.headers.get('www-authenticate') });
    }
    return response;
  };
  return createClientFromTransport(
    'http',
    async () => new StreamableHTTPClientTransport(new URL(options.url), { fetch: fetchWithBearer }),
  );
}

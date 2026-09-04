import { describe, test } from 'bun:test';
import { createToolInbox } from '@joovoice/state-as-tools';
import { createBooth } from '../booth.ts';
import { createHttpClient } from '../mcp/client.ts';

const enabled = process.env.PHONEBOOTH_LOCAL_E2E === '1';
const localDescribe = enabled ? describe : describe.skip;

const pageUrl = normalizeUrl(process.env.PHONEBOOTH_E2E_PAGE_URL ?? 'http://127.0.0.1:5180');
const apiUrl = normalizeUrl(process.env.PHONEBOOTH_E2E_API_URL ?? 'http://127.0.0.1:2010');
const mcpUrl = normalizeUrl(process.env.PHONEBOOTH_E2E_MCP_URL ?? 'http://127.0.0.1:4323/mcp');
const pageOrigin = new URL(pageUrl).origin;

const requiredAgentTools = [
  'create_call_request',
  'check_call_request',
  'wait_for_call_request',
  'answer_call_questions',
  'list_call_requests',
  'check_account',
] as const;
const untrustedAgentTools = requiredAgentTools.filter((name) => name !== 'check_account');
const forbiddenAgentTools = new Set([
  'place_call_request',
  'retry_call_request',
  'review_and_call',
  'approve_call_request',
]);

localDescribe('Phonebooth local stack', () => {
  test('serves the Phonebooth page, not another local app', async () => {
    const response = await fetchRequired('Phonebooth page', pageUrl);
    if (!response.ok) {
      throw new Error(`Phonebooth page at ${pageUrl} answered HTTP ${response.status}.`);
    }
    const html = await response.text();
    if (!/<title>\s*Phonebooth by JooVoice\s*<\/title>/i.test(html)) {
      throw new Error(`${pageUrl} is listening, but it is not the Phonebooth page. Set PHONEBOOTH_E2E_PAGE_URL to the active Phonebooth server.`);
    }
  });

  test('runs the device-login start and pending-wait boundary without credentials', async () => {
    const health = await fetchRequired('JooVoice API', endpoint(apiUrl, '/healthz'));
    if (!health.ok) throw new Error(`JooVoice API health at ${endpoint(apiUrl, '/healthz')} answered HTTP ${health.status}.`);
    const healthPayload = await jsonObject(health, 'JooVoice API health');
    if (healthPayload.ok !== true || healthPayload.service !== 'control-plane-api') {
      throw new Error(`The service at ${apiUrl} does not identify as the JooVoice control-plane API.`);
    }

    const start = await fetchRequired('JooVoice device login', endpoint(apiUrl, '/auth/device/start'), {
      method: 'POST',
      headers: jsonHeaders({ Origin: pageOrigin }),
      body: JSON.stringify({ clientName: 'Phonebooth local E2E', pageOrigin }),
    });
    if (!start.ok) {
      throw new Error(`JooVoice device login at ${apiUrl} answered HTTP ${start.status}. Phonebooth requires /auth/device/start and /auth/device/wait on its configured API.`);
    }
    assertCors(start, pageOrigin, 'JooVoice device login');
    const request = await jsonObject(start, 'JooVoice device login');
    requireString(request, 'deviceCode', 'JooVoice device login');
    requireString(request, 'userCode', 'JooVoice device login');
    requireString(request, 'loginUrl', 'JooVoice device login');
    if (typeof request.expiresAt !== 'string' && typeof request.expiresAt !== 'number') {
      throw new Error('JooVoice device login did not return an expiry.');
    }
    if (typeof request.pollSeconds !== 'number' || request.pollSeconds < 1) {
      throw new Error('JooVoice device login did not return a usable polling cadence.');
    }

    const wait = await fetchRequired('JooVoice device wait', endpoint(apiUrl, '/auth/device/wait'), {
      method: 'POST',
      headers: jsonHeaders({ Origin: pageOrigin }),
      body: JSON.stringify({ deviceCode: request.deviceCode, maxWaitSeconds: 1 }),
    }, 5_000);
    if (!wait.ok) throw new Error(`JooVoice device wait at ${apiUrl} answered HTTP ${wait.status}.`);
    assertCors(wait, pageOrigin, 'JooVoice device wait');
    const waitPayload = await jsonObject(wait, 'JooVoice device wait');
    if (waitPayload.status !== 'pending') {
      throw new Error(`A newly-created device login should remain pending; JooVoice returned ${String(waitPayload.status)}.`);
    }
  }, 8_000);

  test('exposes a healthy, browser-safe MCP edge', async () => {
    const health = await mcpHealth();
    requireString(health, 'service', 'MCP health');

    const unauthorized = await fetchRequired('MCP authentication challenge', mcpUrl, {
      method: 'POST',
      headers: jsonHeaders({ Accept: 'application/json, text/event-stream' }),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'phonebooth-local-e2e', version: '0.1.0' } },
      }),
    });
    if (unauthorized.status !== 401 && unauthorized.status !== 403) {
      throw new Error(`MCP accepted an unauthenticated initialize request with HTTP ${unauthorized.status}.`);
    }
    if (!/^Bearer\b/i.test(unauthorized.headers.get('www-authenticate') ?? '')) {
      throw new Error('MCP authentication failure did not include a Bearer WWW-Authenticate challenge.');
    }

    const preflight = await fetchRequired('MCP browser preflight', mcpUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: pageOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization, content-type, accept, mcp-session-id, last-event-id',
      },
    });
    if (!preflight.ok) throw new Error(`MCP rejected Phonebooth's browser origin with HTTP ${preflight.status}.`);
    assertCors(preflight, pageOrigin, 'MCP browser preflight');
    requireHeaderIncludes(preflight, 'access-control-allow-headers', 'authorization', 'MCP browser preflight');
    requireHeaderIncludes(preflight, 'access-control-expose-headers', 'mcp-session-id', 'MCP browser preflight');
  });

  test('serves the typed, non-dialing public agent contract', async () => {
    const { service } = await mcpIdentity();
    const client = createHttpClient({ url: mcpUrl, token: () => mcpBearer(service) });
    try {
      await client.connect();
      const tools = await client.listTools();
      const byName = new Map(tools.map((tool) => [tool.name, tool]));
      const missing = requiredAgentTools.filter((name) => !byName.has(name));
      if (missing.length > 0) {
        throw new Error(`MCP ${service} is missing public agent tools: ${missing.join(', ')}.`);
      }
      const missingOutputSchemas = requiredAgentTools.filter((name) => byName.get(name)?.outputSchema === undefined);
      if (missingOutputSchemas.length > 0) {
        throw new Error(`MCP tools missing output schemas: ${missingOutputSchemas.join(', ')}.`);
      }
      const missingUntrustedMarker = untrustedAgentTools.filter((name) => byName.get(name)?.annotations.untrustedContentHint !== true);
      if (missingUntrustedMarker.length > 0) {
        throw new Error(`MCP tools missing untrusted-content markers: ${missingUntrustedMarker.join(', ')}.`);
      }
      const incorrectlyExposed = tools.map((tool) => tool.name).filter((name) => forbiddenAgentTools.has(name));
      if (incorrectlyExposed.length > 0) {
        throw new Error(`MCP exposed a human-only placement action to agents: ${incorrectlyExposed.join(', ')}.`);
      }
    } finally {
      await client.close().catch(() => undefined);
    }
  }, 8_000);

  test('hydrates the real Phonebooth store and starts its account subscription', async () => {
    const { service } = await mcpIdentity();
    const client = createHttpClient({ url: mcpUrl, token: () => mcpBearer(service) });
    const booth = createBooth({ client, inbox: createToolInbox(null) });
    try {
      await booth.connect();
      if (booth.state.phase !== 'ready') {
        throw new Error(`Phonebooth could not hydrate through MCP ${service}: ${booth.state.error ?? booth.state.phase}.`);
      }
      if (!booth.state.account) {
        throw new Error(`MCP ${service} did not return the account state Phonebooth needs to choose its first screen.`);
      }
      if (!Array.isArray(booth.state.requests)) {
        throw new Error(`MCP ${service} did not return a call-request list.`);
      }
      if (booth.state.streamDown) {
        throw new Error(`MCP ${service} hydrated once, but Phonebooth could not establish its account/request subscriptions.`);
      }
    } finally {
      await booth.close();
    }
  }, 8_000);
});

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function endpoint(base: string, path: string): string {
  return `${base}${path}`;
}

function jsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  return { Accept: 'application/json', 'Content-Type': 'application/json', ...extra };
}

async function fetchRequired(label: string, input: string, init?: RequestInit, timeoutMs = 3_000): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`${label} is unavailable at ${input}: ${detail}`);
  }
}

async function jsonObject(response: Response, label: string): Promise<Record<string, unknown>> {
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label} did not return a JSON object.`);
  }
  return payload as Record<string, unknown>;
}

function requireString(payload: Record<string, unknown>, key: string, label: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} did not return ${key}.`);
  return value;
}

function assertCors(response: Response, origin: string, label: string): void {
  const allowed = response.headers.get('access-control-allow-origin');
  if (allowed !== origin && allowed !== '*') throw new Error(`${label} did not allow the Phonebooth origin ${origin}.`);
}

function requireHeaderIncludes(response: Response, name: string, expected: string, label: string): void {
  const value = response.headers.get(name)?.toLowerCase() ?? '';
  if (!value.includes(expected.toLowerCase())) throw new Error(`${label} response is missing ${expected} in ${name}.`);
}

async function mcpHealth(): Promise<Record<string, unknown>> {
  const url = `${new URL(mcpUrl).origin}/health`;
  const response = await fetchRequired('MCP health', url);
  if (!response.ok) throw new Error(`MCP health at ${url} answered HTTP ${response.status}.`);
  const payload = await jsonObject(response, 'MCP health');
  if (payload.ok !== true) throw new Error('MCP health did not report ok.');
  return payload;
}

async function mcpIdentity(): Promise<{ service: string }> {
  const health = await mcpHealth();
  return { service: requireString(health, 'service', 'MCP health') };
}

function mcpBearer(service: string): string {
  const configured = process.env.PHONEBOOTH_E2E_SESSION_TOKEN?.trim();
  if (configured) return configured;
  if (service === 'public-call-api-mcp-experiment') return 'phonebooth-local-e2e-synthetic-session';
  throw new Error(`MCP ${service} requires an authenticated session. Set PHONEBOOTH_E2E_SESSION_TOKEN in the calling environment; do not pass tokens as command-line arguments.`);
}

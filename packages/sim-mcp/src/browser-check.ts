import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createSimulatedServer } from './server.ts';
import type { StatusObject } from './types.ts';

export const transportClass = StreamableHTTPClientTransport;

export async function roundTrip(): Promise<{ toolCount: number; status: string }> {
  const sim = createSimulatedServer({ autoTick: false });
  const client = new Client({ name: 'check-client', version: '0.0.0' });
  await client.connect(await sim.connect());
  const tools = await client.listTools();
  const result = await client.callTool({
    name: 'create_call_request',
    arguments: { request: 'Ask one thing', phone: '+6591234512', ownerTimezone: 'Asia/Singapore' },
  });
  await client.close();
  await sim.close();
  const status = result.structuredContent as StatusObject;
  return { toolCount: tools.tools.length, status: status.status };
}

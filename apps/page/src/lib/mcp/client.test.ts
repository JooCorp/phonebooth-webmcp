import { describe, expect, test } from 'bun:test';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ListToolsRequestSchema, SubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClientFromTransport } from './client.ts';

function reconnectableServer() {
  let active: Server | null = null;
  let connections = 0;

  return {
    get connections() {
      return connections;
    },
    async open(): Promise<Transport> {
      const server = new Server(
        { name: `phonebooth-test-${connections + 1}`, version: '0.1.0' },
        { capabilities: { resources: { subscribe: true }, tools: {} } },
      );
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [{ name: 'check_account', description: 'Read account state.', inputSchema: { type: 'object' } }],
      }));
      server.setRequestHandler(SubscribeRequestSchema, async () => ({}));
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await server.connect(serverSide);
      active = server;
      connections += 1;
      return clientSide;
    },
    async interrupt() {
      await active?.close();
      active = null;
      await Bun.sleep(0);
    },
    async close() {
      await active?.close();
      active = null;
    },
  };
}

describe('MCP client connection lifecycle', () => {
  test('opens a fresh transport after the active MCP session disappears', async () => {
    const service = reconnectableServer();
    const client = createClientFromTransport('http', () => service.open(), () => service.close());
    let closes = 0;
    client.onClose(() => {
      closes += 1;
    });

    await client.connect();
    expect((await client.listTools()).map((tool) => tool.name)).toEqual(['check_account']);
    expect(service.connections).toBe(1);

    await service.interrupt();
    expect(closes).toBe(1);

    await client.subscribe('joovoice://account');
    expect(service.connections).toBe(2);
    expect((await client.listTools()).map((tool) => tool.name)).toEqual(['check_account']);

    await client.close();
  });
});

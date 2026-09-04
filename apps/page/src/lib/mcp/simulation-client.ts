import { createSimulatedServer, type SimulatedServer, type SimulatedServerOptions } from '@phonebooth/sim-mcp';
import { createClientFromTransport, type BoothClient } from './client.ts';

export interface SimulationClient extends BoothClient {
  simulation: SimulatedServer;
}

export function createSimulationClient(options: SimulatedServerOptions = {}): SimulationClient {
  const simulation = createSimulatedServer(options);
  const client = createClientFromTransport('simulation', () => simulation.connect(), () => simulation.close());
  return Object.assign(client, { simulation });
}

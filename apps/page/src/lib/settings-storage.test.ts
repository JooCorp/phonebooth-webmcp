import { describe, expect, test } from 'bun:test';
import { mcpUrlFor, readPersonalToken, readSettings, serviceConfigured, writePersonalToken, writeSettings } from './settings-storage.ts';

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe('settings storage', () => {
  test('defaults to simulation and round-trips', () => {
    const storage = memory();
    expect(readSettings(storage)).toEqual({ mode: 'simulation', selfHostedUrl: '' });
    writeSettings(storage, { mode: 'self_hosted', selfHostedUrl: 'http://localhost:4323' });
    expect(readSettings(storage)).toEqual({ mode: 'self_hosted', selfHostedUrl: 'http://localhost:4323' });
    storage.setItem('phonebooth.settings', '{"mode":"bogus"}');
    expect(readSettings(storage).mode).toBe('simulation');
    expect(readSettings(null).mode).toBe('simulation');
  });

  test('accepts only well-formed personal tokens', () => {
    const storage = memory();
    const token = `pat_${'a'.repeat(40)}`;
    expect(writePersonalToken(storage, token)).toBe(true);
    expect(readPersonalToken(storage)).toBe(token);
    expect(writePersonalToken(storage, 'pat_short')).toBe(false);
    expect(readPersonalToken(storage)).toBe(token);
    expect(writePersonalToken(storage, '')).toBe(true);
    expect(readPersonalToken(storage)).toBe('');
  });

  test('derives the MCP url and whether a service is configured', () => {
    expect(mcpUrlFor('http://localhost:4323')).toBe('http://localhost:4323/mcp');
    expect(mcpUrlFor('http://localhost:4323/mcp/')).toBe('http://localhost:4323/mcp');
    expect(mcpUrlFor('')).toBe('');
    expect(serviceConfigured({ mode: 'self_hosted', selfHostedUrl: '' }, 'x')).toBe(false);
    expect(serviceConfigured({ mode: 'hosted', selfHostedUrl: '' }, '')).toBe(false);
    expect(serviceConfigured({ mode: 'hosted', selfHostedUrl: '' }, 'http://localhost:4323/mcp')).toBe(true);
    expect(serviceConfigured({ mode: 'simulation', selfHostedUrl: '' }, '')).toBe(true);
  });
});

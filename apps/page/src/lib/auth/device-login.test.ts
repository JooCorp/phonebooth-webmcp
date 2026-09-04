import { describe, expect, test } from 'bun:test';
import {
  createDeviceLoginClient,
  devicePendingKey,
  deviceSessionKey,
  type DeviceLoginStorage,
} from './device-login.ts';

function storage(): DeviceLoginStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('device login client', () => {
  test('starts with JooVoice and stores the approved session after waiting', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const responses = [
      { deviceCode: 'device-secret', userCode: 'ABCD-1234', loginUrl: 'https://login.example/?code=ABCD-1234', expiresAt: 120_000, pollSeconds: 2 },
      { status: 'pending' },
      { status: 'approved', sessionToken: 'session-secret', user: { displayName: 'Demo User' } },
    ];
    const stored = storage();
    const pending = storage();
    const client = createDeviceLoginClient({
      apiBaseUrl: 'https://api.example/',
      pageOrigin: 'https://booth.example',
      storage: stored,
      pendingStorage: pending,
      now: () => 60_000,
      sleep: async () => undefined,
      fetch: (async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json(responses.shift());
      }) as typeof fetch,
    });

    const request = await client.start();
    expect(client.pendingRequest()?.userCode).toBe('ABCD-1234');
    expect(pending.values.has(devicePendingKey)).toBeTrue();
    const approval = await client.waitForApproval(request);

    expect(request.userCode).toBe('ABCD-1234');
    expect(approval.status).toBe('approved');
    expect(client.sessionToken()).toBe('session-secret');
    expect(stored.values.get(deviceSessionKey)).toBe('session-secret');
    expect(client.pendingRequest()).toBeNull();
    expect(calls).toEqual([
      { url: 'https://api.example/auth/device/start', body: { clientName: 'Phonebooth', pageOrigin: 'https://booth.example' } },
      { url: 'https://api.example/auth/device/wait', body: { deviceCode: 'device-secret', maxWaitSeconds: 25 } },
      { url: 'https://api.example/auth/device/wait', body: { deviceCode: 'device-secret', maxWaitSeconds: 25 } },
    ]);
  });

  test('clears a stored session and rejects an expired request', async () => {
    const stored = storage();
    const pending = storage();
    stored.setItem(deviceSessionKey, 'old-session');
    pending.setItem(devicePendingKey, JSON.stringify({
      deviceCode: 'expired',
      userCode: 'ABCD-1234',
      loginUrl: 'https://login.example',
      expiresAt: 120_000_000_000,
      pollSeconds: 2,
    }));
    const client = createDeviceLoginClient({
      apiBaseUrl: 'https://api.example',
      pageOrigin: 'https://booth.example',
      storage: stored,
      pendingStorage: pending,
      now: () => 120_000_000_001,
      fetch: (async () => {
        throw new Error('should not fetch');
      }) as unknown as typeof fetch,
    });

    client.clear();
    expect(client.sessionToken()).toBeNull();
    expect(client.pendingRequest()).toBeNull();
    await expect(client.waitForApproval({
      deviceCode: 'expired',
      userCode: 'ABCD-1234',
      loginUrl: 'https://login.example',
      expiresAt: 120_000_000_000,
      pollSeconds: 2,
    })).rejects.toThrow('expired');
  });

  test('recovers the pending handoff after a refresh and retains it after a network error', async () => {
    const stored = storage();
    const pending = storage();
    const request = {
      deviceCode: 'refresh-secret',
      userCode: 'WXYZ-6789',
      loginUrl: 'https://login.example/?code=WXYZ-6789',
      expiresAt: 180_000,
      pollSeconds: 2,
    };
    pending.setItem(devicePendingKey, JSON.stringify(request));
    const client = createDeviceLoginClient({
      apiBaseUrl: 'https://api.example',
      pageOrigin: 'https://booth.example',
      storage: stored,
      pendingStorage: pending,
      now: () => 60_000,
      fetch: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });

    expect(client.pendingRequest()).toEqual(request);
    await expect(client.waitForApproval(request)).rejects.toThrow('offline');
    expect(client.pendingRequest()).toEqual(request);

    client.clearPending();
    expect(client.pendingRequest()).toBeNull();
  });

  test('redeems the fallback auth string when automatic delivery was consumed during refresh', async () => {
    const stored = storage();
    const pending = storage();
    pending.setItem(devicePendingKey, JSON.stringify({
      deviceCode: 'refresh-secret',
      userCode: 'WXYZ-6789',
      loginUrl: 'https://login.example/?code=WXYZ-6789',
      expiresAt: 180_000,
      pollSeconds: 2,
    }));
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = createDeviceLoginClient({
      apiBaseUrl: 'https://api.example',
      pageOrigin: 'https://booth.example',
      storage: stored,
      pendingStorage: pending,
      fetch: (async (input, init) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return Response.json({ status: 'approved', sessionToken: 'fallback-session' });
      }) as typeof fetch,
    });

    await client.redeemFallback('jv_auth_recovery');

    expect(client.sessionToken()).toBe('fallback-session');
    expect(client.pendingRequest()).toBeNull();
    expect(calls).toEqual([{
      url: 'https://api.example/auth/device/redeem',
      body: { fallbackAuthString: 'jv_auth_recovery' },
    }]);
  });

  test('routes an already-delivered automatic session into fallback recovery', async () => {
    const stored = storage();
    const pending = storage();
    const request = {
      deviceCode: 'refresh-secret',
      userCode: 'WXYZ-6789',
      loginUrl: 'https://login.example/?code=WXYZ-6789',
      expiresAt: 180_000,
      pollSeconds: 2,
    };
    pending.setItem(devicePendingKey, JSON.stringify(request));
    const client = createDeviceLoginClient({
      apiBaseUrl: 'https://api.example',
      pageOrigin: 'https://booth.example',
      storage: stored,
      pendingStorage: pending,
      now: () => 60_000,
      fetch: (async () => Response.json({ status: 'delivered' })) as unknown as typeof fetch,
    });

    await expect(client.waitForApproval(request)).rejects.toMatchObject({
      name: 'DeviceLoginError',
      status: 'delivered',
    });
    expect(client.pendingRequest()).toBeNull();
  });
});

export interface DeviceLoginStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DeviceLoginRequest {
  deviceCode: string;
  userCode: string;
  loginUrl: string;
  expiresAt: number | string;
  pollSeconds: number;
}

export interface DeviceLoginApproval {
  status: 'approved';
  sessionToken: string;
  principal?: { userId: string; activeAccountId?: string | null };
  user?: { displayName?: string };
}

type DeviceLoginWaitResult =
  | DeviceLoginApproval
  | { status: 'pending'; expiresAt?: number | string; pollSeconds?: number }
  | { status: 'expired' | 'failed' | 'delivered' | 'denied' | 'consumed' };

export type DeviceLoginTerminalStatus = Exclude<DeviceLoginWaitResult['status'], 'pending' | 'approved'>;

export class DeviceLoginError extends Error {
  constructor(
    readonly status: DeviceLoginTerminalStatus,
    message: string,
  ) {
    super(message);
    this.name = 'DeviceLoginError';
  }
}

export interface DeviceLoginClientOptions {
  apiBaseUrl: string;
  pageOrigin: string;
  storage: DeviceLoginStorage;
  pendingStorage?: DeviceLoginStorage;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export interface DeviceLoginClient {
  start(): Promise<DeviceLoginRequest>;
  waitForApproval(request: DeviceLoginRequest, signal?: AbortSignal): Promise<DeviceLoginApproval>;
  redeemFallback(fallbackAuthString: string): Promise<DeviceLoginApproval>;
  sessionToken(): string | null;
  pendingRequest(): DeviceLoginRequest | null;
  clearSession(): void;
  clearPending(): void;
  clear(): void;
}

export const deviceSessionKey = 'phonebooth.device.session';
export const devicePendingKey = 'phonebooth.device.pending';

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

async function readJson<T>(doFetch: typeof fetch, url: string, init: RequestInit): Promise<T> {
  const response = await doFetch(url, init);
  const payload = await response.json().catch(() => null) as ({ message?: string } & T) | null;
  if (!response.ok) throw new Error(payload?.message ?? `JooVoice answered ${response.status}`);
  if (!payload) throw new Error('JooVoice returned an empty response');
  return payload;
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function expiresAtMs(value: number | string): number {
  if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireStartResponse(payload: DeviceLoginRequest): DeviceLoginRequest {
  if (!payload.deviceCode || !payload.userCode || !payload.loginUrl || !payload.expiresAt) {
    throw new Error('JooVoice returned an incomplete login request');
  }
  return {
    ...payload,
    pollSeconds: Math.max(1, Number(payload.pollSeconds) || 2),
  };
}

function readPendingRequest(storage: DeviceLoginStorage | undefined, now: () => number): DeviceLoginRequest | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(devicePendingKey);
    if (!raw) return null;
    const request = requireStartResponse(JSON.parse(raw) as DeviceLoginRequest);
    if (now() >= expiresAtMs(request.expiresAt)) {
      storage.removeItem(devicePendingKey);
      return null;
    }
    return request;
  } catch {
    try {
      storage.removeItem(devicePendingKey);
    } catch {
      // Storage may be unavailable in privacy-restricted browsers.
    }
    return null;
  }
}

function writePendingRequest(storage: DeviceLoginStorage | undefined, request: DeviceLoginRequest): void {
  try {
    storage?.setItem(devicePendingKey, JSON.stringify(request));
  } catch {
    // Refresh recovery is best-effort when browser storage is unavailable.
  }
}

function removeStored(storage: DeviceLoginStorage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage may be unavailable in privacy-restricted browsers.
  }
}

function terminalMessage(status: DeviceLoginTerminalStatus): string {
  if (status === 'delivered' || status === 'consumed') {
    return 'Automatic sign-in finished in another page. Use the recovery string shown by JooVoice.';
  }
  if (status === 'failed' || status === 'denied') {
    return 'JooVoice could not approve this sign-in. Try Login again.';
  }
  return 'The JooVoice login code expired. Try Login again.';
}

export function createDeviceLoginClient(options: DeviceLoginClientOptions): DeviceLoginClient {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  return {
    async start() {
      const payload = await readJson<DeviceLoginRequest>(doFetch, endpoint(options.apiBaseUrl, '/auth/device/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ clientName: 'Phonebooth', pageOrigin: options.pageOrigin }),
      });
      const request = requireStartResponse(payload);
      writePendingRequest(options.pendingStorage, request);
      return request;
    },

    async waitForApproval(request, signal) {
      while (now() < expiresAtMs(request.expiresAt)) {
        const result = await readJson<DeviceLoginWaitResult>(doFetch, endpoint(options.apiBaseUrl, '/auth/device/wait'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ deviceCode: request.deviceCode, maxWaitSeconds: 25 }),
          signal,
        });
        if (result.status === 'approved') {
          if (!result.sessionToken) throw new Error('JooVoice approved the login without a session');
          options.storage.setItem(deviceSessionKey, result.sessionToken);
          removeStored(options.pendingStorage, devicePendingKey);
          return result;
        }
        if (result.status !== 'pending') {
          removeStored(options.pendingStorage, devicePendingKey);
          throw new DeviceLoginError(result.status, terminalMessage(result.status));
        }
        if (now() >= expiresAtMs(result.expiresAt ?? request.expiresAt)) break;
        await sleep(Math.max(1, result.pollSeconds ?? request.pollSeconds) * 1000, signal);
      }
      removeStored(options.pendingStorage, devicePendingKey);
      throw new Error('The JooVoice login code expired. Try Login again.');
    },

    async redeemFallback(fallbackAuthString) {
      const payload = await readJson<DeviceLoginApproval>(doFetch, endpoint(options.apiBaseUrl, '/auth/device/redeem'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ fallbackAuthString }),
      });
      if (payload.status !== 'approved' || !payload.sessionToken) {
        throw new Error('JooVoice did not return an approved session');
      }
      options.storage.setItem(deviceSessionKey, payload.sessionToken);
      removeStored(options.pendingStorage, devicePendingKey);
      return payload;
    },

    sessionToken() {
      try {
        return options.storage.getItem(deviceSessionKey);
      } catch {
        return null;
      }
    },

    pendingRequest() {
      return readPendingRequest(options.pendingStorage, now);
    },

    clearSession() {
      removeStored(options.storage, deviceSessionKey);
    },

    clearPending() {
      removeStored(options.pendingStorage, devicePendingKey);
    },

    clear() {
      removeStored(options.storage, deviceSessionKey);
      removeStored(options.pendingStorage, devicePendingKey);
    },
  };
}

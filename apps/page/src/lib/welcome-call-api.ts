import type { ErrorGuide, WelcomeCallState } from './types.ts';

export interface WelcomeCallResponse {
  welcomeCall: WelcomeCallState;
  checkAfterSeconds?: number;
}

export type WelcomeCallExhaustionCode = 'welcome_call_exhausted' | 'welcome_call_unavailable';

export class WelcomeCallApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: Record<string, unknown> | null,
  ) {
    super(publicMessage(payload) ?? `JooVoice answered ${status}`);
    this.name = 'WelcomeCallApiError';
  }

  get code(): string | null {
    return typeof this.payload?.code === 'string' ? this.payload.code : null;
  }

  get isExhaustion(): boolean {
    return this.code === 'welcome_call_exhausted' || this.code === 'welcome_call_unavailable';
  }

  toGuide(): ErrorGuide {
    const detail = errorDetail(this.payload);
    const kind = isErrorKind(detail?.kind)
      ? detail.kind
      : detail?.kind === 'authentication_required'
        ? 'owner_action_required'
        : 'something_went_wrong';
    const message = publicMessage(this.payload) ?? 'The welcome call could not continue.';
    return {
      kind,
      headline: typeof detail?.headline === 'string' ? detail.headline : message,
      fix: typeof detail?.fix === 'string' ? detail.fix : message,
      next: [],
      sayToOwner: typeof detail?.sayToOwner === 'string' ? detail.sayToOwner : message,
      ...(typeof detail?.retryAfterSeconds === 'number'
        ? { retryAfterSeconds: detail.retryAfterSeconds }
        : {}),
    };
  }
}

export interface WelcomeCallApi {
  read(): Promise<WelcomeCallResponse>;
  request(phone: string): Promise<WelcomeCallResponse>;
  acknowledge(): Promise<WelcomeCallResponse>;
}

export interface WelcomeCallApiOptions {
  apiBaseUrl: string;
  token: () => Promise<string | null> | string | null;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onChallenge?: (status: 401 | 403) => void;
}

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorDetail(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  return isRecord(payload?.error) ? payload.error : payload;
}

function publicMessage(payload: Record<string, unknown> | null): string | null {
  const detail = errorDetail(payload);
  for (const key of ['text', 'fix', 'message', 'headline']) {
    const value = detail?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function isErrorKind(value: unknown): value is ErrorGuide['kind'] {
  return typeof value === 'string' && [
    'owner_action_required',
    'not_allowed_right_now',
    'fix_the_request',
    'questions_changed',
    'try_again_shortly',
    'something_went_wrong',
  ].includes(value);
}

function parseWelcomeCall(value: unknown): WelcomeCallState {
  if (!isRecord(value)) throw new Error('JooVoice returned an incomplete welcome-call state.');
  const status = value.status;
  const phoneAlias = value.phoneAlias;
  if (
    typeof status !== 'string'
    || !['required', 'requested', 'calling', 'complete'].includes(status)
    || (phoneAlias !== null && typeof phoneAlias !== 'string')
    || typeof value.acknowledged !== 'boolean'
  ) {
    throw new Error('JooVoice returned an incomplete welcome-call state.');
  }
  const reason = value.reason;
  return {
    status: status as WelcomeCallState['status'],
    phoneAlias,
    acknowledged: value.acknowledged,
    ...(isRecord(reason) && typeof reason.code === 'string' && typeof reason.text === 'string'
      ? {
          reason: {
            code: reason.code,
            text: reason.text,
            ...(typeof reason.retryAfter === 'string' ? { retryAfter: reason.retryAfter } : {}),
          },
        }
      : {}),
  };
}

function parseResponse(value: unknown): WelcomeCallResponse {
  if (!isRecord(value) || !('welcomeCall' in value)) {
    throw new Error('JooVoice returned an incomplete welcome-call response.');
  }
  return {
    welcomeCall: parseWelcomeCall(value.welcomeCall),
    ...(typeof value.checkAfterSeconds === 'number' && Number.isFinite(value.checkAfterSeconds)
      ? { checkAfterSeconds: Math.max(1, value.checkAfterSeconds) }
      : {}),
  };
}

export function createWelcomeCallApi(options: WelcomeCallApiOptions): WelcomeCallApi {
  const doFetch: NonNullable<WelcomeCallApiOptions['fetch']> = options.fetch ?? fetch;

  async function request(path: string, init: RequestInit = {}): Promise<WelcomeCallResponse> {
    const token = await options.token();
    if (!token) throw new Error('Sign in to JooVoice before requesting a welcome call.');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    const response = await doFetch(endpoint(options.apiBaseUrl, path), { ...init, headers });
    const candidate: unknown = await response.json().catch(() => null);
    const payload = isRecord(candidate) ? candidate : null;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) options.onChallenge?.(response.status);
      throw new WelcomeCallApiError(response.status, payload);
    }
    return parseResponse(payload);
  }

  return {
    read: () => request('/v1/account/welcome-call'),
    request: (phone) => request('/v1/account/welcome-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    }),
    acknowledge: () => request('/v1/account/welcome-call/acknowledge', { method: 'POST' }),
  };
}

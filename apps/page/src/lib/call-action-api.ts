import type { ErrorGuide } from './types.ts';

export type HumanCallAction = 'place_call_request' | 'retry_call_request';

export interface CallActionApi {
  act(
    action: HumanCallAction,
    callRequestId: string,
    revision: number,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>>;
}

export interface CallActionApiOptions {
  apiBaseUrl: string;
  token: () => Promise<string | null> | string | null;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onChallenge?: (status: 401 | 403) => void;
}

export class CallActionApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: Record<string, unknown> | null,
  ) {
    super(publicMessage(payload) ?? `JooVoice answered ${status}`);
    this.name = 'CallActionApiError';
  }

  get current(): unknown {
    const detail = errorDetail(this.payload);
    return detail?.current;
  }

  toGuide(): ErrorGuide {
    const detail = errorDetail(this.payload);
    const kind = mapErrorKind(detail?.kind);
    const message = publicMessage(this.payload) ?? 'JooVoice could not continue this call yet.';
    return {
      kind,
      headline: typeof detail?.headline === 'string' ? detail.headline : message,
      fix: typeof detail?.fix === 'string' ? detail.fix : message,
      next: [],
      sayToOwner: typeof detail?.sayToOwner === 'string' ? detail.sayToOwner : message,
    };
  }
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
  for (const key of ['fix', 'headline', 'message', 'text']) {
    const value = detail?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

function mapErrorKind(value: unknown): ErrorGuide['kind'] {
  if (value === 'authentication_required') return 'owner_action_required';
  if (value === 'fix_the_request' || value === 'questions_changed' || value === 'try_again_shortly') {
    return value;
  }
  if (value === 'review_changed' || value === 'not_found') return 'not_allowed_right_now';
  return 'something_went_wrong';
}

export function createCallActionApi(options: CallActionApiOptions): CallActionApi {
  const doFetch: NonNullable<CallActionApiOptions['fetch']> = options.fetch ?? fetch;

  return {
    async act(action, callRequestId, revision, idempotencyKey) {
      const token = await options.token();
      if (!token) throw new Error('Sign in to JooVoice before placing a call.');
      const suffix = action === 'place_call_request' ? 'review-and-call' : 'retry';
      const response = await doFetch(
        endpoint(options.apiBaseUrl, `/v1/call-requests/${encodeURIComponent(callRequestId)}/${suffix}`),
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({ revision }),
        },
      );
      const candidate: unknown = await response.json().catch(() => null);
      const payload = isRecord(candidate) ? candidate : null;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) options.onChallenge?.(response.status);
        throw new CallActionApiError(response.status, payload);
      }
      if (!payload) throw new Error('JooVoice returned an incomplete call response.');
      return payload;
    },
  };
}

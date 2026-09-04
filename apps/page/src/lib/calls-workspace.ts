import { isTerminal, type CallRequestStatus, type LivePhase, type StatusObject } from '$lib/types.ts';
import { callVerdictPresentation } from '$lib/call-verdict.ts';

export type RequestTone = 'agent' | 'human' | 'time' | 'success' | 'warning' | 'muted';

export type RequestPresentation = {
  label: string;
  title: string;
  description: string;
  tone: RequestTone;
};

const liveCopy: Record<LivePhase, string> = {
  dialing: 'JooVoice is dialing now.',
  ringing: 'The other end is ringing.',
  connected: 'The conversation is in progress.',
  on_hold: 'The call is on hold.',
  ending: 'JooVoice is wrapping up the call.',
};

function queuedPresentation(request: StatusObject): RequestPresentation {
  if (request.callNow) {
    return readyForYouPresentation();
  }

  return {
    label: 'Ready',
    title: 'This call is lined up.',
    description: request.window?.text || 'JooVoice will place it automatically when the timing is right.',
    tone: 'time',
  };
}

function readyForYouPresentation(): RequestPresentation {
  return {
    label: 'Ready for you',
    title: 'This call is ready to place.',
    description: 'JooVoice will start when you press the button.',
    tone: 'human',
  };
}

function donePresentation(request: StatusObject): RequestPresentation {
  const verdict = callVerdictPresentation(request);
  return {
    label: verdict?.label ?? 'Call complete',
    title:
      request.result?.presentation?.headline?.trim()
      || verdict?.headline
      || 'The call has finished.',
    description: verdict?.detail || request.result?.summary || 'The result is ready to review.',
    tone: verdict?.state === 'succeeded'
      ? 'success'
      : verdict?.state === 'pending'
        ? 'time'
        : 'warning',
  };
}

export function requestPresentation(request: StatusObject): RequestPresentation {
  switch (request.status) {
    case 'thinking':
      return {
        label: 'Preparing call',
        title: 'JooVoice is working out the details.',
        description: 'The request is with JooVoice. This page will update when it needs you.',
        tone: 'agent',
      };
    case 'needs_answers':
      return {
        label: 'Needs your answer',
        title: 'A few details are needed.',
        description: 'Answer the open questions so JooVoice can continue.',
        tone: 'human',
      };
    case 'ready_for_review':
      return readyForYouPresentation();
    case 'queued':
      return queuedPresentation(request);
    case 'calling':
      return {
        label: 'Call in progress',
        title: 'JooVoice is on the call.',
        description: request.live ? liveCopy[request.live.phase] : 'The conversation is in progress.',
        tone: 'time',
      };
    case 'done':
      return donePresentation(request);
    case 'not_placed':
      return {
        label: 'Not placed',
        title: 'This call was not made.',
        description: request.reason?.text || 'JooVoice could not place the call.',
        tone: 'warning',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        title: 'This call was cancelled.',
        description: 'Nothing else will happen with this request.',
        tone: 'muted',
      };
  }
}

export function requestStatusLabel(status: CallRequestStatus): string {
  switch (status) {
    case 'thinking':
      return 'Preparing';
    case 'needs_answers':
      return 'Needs answer';
    case 'ready_for_review':
      return 'Ready for you';
    case 'queued':
      return 'Ready';
    case 'calling':
      return 'Calling';
    case 'done':
      return 'Complete';
    case 'not_placed':
      return 'Not placed';
    case 'cancelled':
      return 'Cancelled';
  }
}

export function requestTone(request: StatusObject): RequestTone {
  return requestPresentation(request).tone;
}

function newestFirst(left: StatusObject, right: StatusObject): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt);
}

/** Only an explicit URL selection opens a request. The default Calls route remains list-first. */
export function selectFocusedRequest(
  requests: readonly StatusObject[],
  requestedId?: string | null,
): StatusObject | undefined {
  if (!requestedId) return undefined;
  return requests.find((entry) => entry.callRequestId === requestedId);
}

export function groupRequests(requests: readonly StatusObject[]): {
  active: StatusObject[];
  recent: StatusObject[];
} {
  const ordered = [...requests].sort(newestFirst);
  return {
    active: ordered.filter((request) => !isTerminal(request.status)),
    recent: ordered.filter((request) => isTerminal(request.status)),
  };
}

export function formatElapsed(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

export function formatRequestTime(value: string, locale?: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
}

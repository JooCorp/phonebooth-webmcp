import type {
  CallRequestStatus,
  CallResult,
  Question,
  QuestionChoice,
  QuestionInput,
  StatusObject,
} from '../types.ts';

const statuses: readonly CallRequestStatus[] = [
  'thinking',
  'needs_answers',
  'ready_for_review',
  'queued',
  'calling',
  'done',
  'not_placed',
  'cancelled',
];

/** Normalize the public JooVoice route shape once, before it enters page state. */
export function fromCallRequest(value: unknown): StatusObject | null {
  const source = record(value);
  if (!source) return null;
  if (typeof source.calleeAlias === 'string') return value as StatusObject;

  const callee = record(source.callee);
  if (!callee || typeof callee.display !== 'string') return null;
  if (
    typeof source.callRequestId !== 'string'
    || !isStatus(source.status)
    || typeof source.meaning !== 'string'
    || typeof source.sayToOwner !== 'string'
    || typeof source.request !== 'string'
    || typeof source.createdAt !== 'string'
    || typeof source.updatedAt !== 'string'
  ) return null;

  const actions = Array.isArray(source.availableActions)
    ? source.availableActions.map(record).filter((action): action is Record<string, unknown> => action !== null)
    : [];
  let checkAfterSeconds: number | undefined;
  let callNow = false;
  let retryNow = false;
  const next = actions.flatMap((action): StatusObject['next'] => {
    if (action.kind === 'answer_questions' && typeof action.questionSetId === 'string') {
      return [{
        tool: 'answer_call_questions',
        args: { callRequestId: source.callRequestId, questionSetId: action.questionSetId },
      }];
    }
    if (action.kind === 'check_status' && Number.isInteger(action.afterSeconds)) {
      checkAfterSeconds = action.afterSeconds as number;
      return [{
        tool: 'check_call_request',
        args: { callRequestId: source.callRequestId },
        after: 'checkAfterSeconds',
      }];
    }
    if (action.kind === 'review_and_call' && Number.isInteger(action.revision)) {
      callNow = true;
      return [{
        tool: 'place_call_request',
        args: { callRequestId: source.callRequestId, revision: action.revision },
      }];
    }
    if (action.kind === 'retry_call' && Number.isInteger(action.revision)) {
      retryNow = true;
      return [{
        tool: 'retry_call_request',
        args: { callRequestId: source.callRequestId, revision: action.revision },
      }];
    }
    return [];
  });
  const questionSet = mapQuestionSet(source.questionSet);
  const result = mapResult(source.result);
  const reason = mapReason(source.reason);
  const attemptSummary = record(source.attemptSummary);

  return {
    callRequestId: source.callRequestId,
    status: source.status,
    meaning: source.meaning,
    sayToOwner: source.sayToOwner,
    next,
    ...(checkAfterSeconds === undefined ? {} : { checkAfterSeconds }),
    request: source.request,
    calleeAlias: callee.display,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    ...(callNow ? { callNow: true as const } : {}),
    ...(retryNow ? { retryNow: true as const } : {}),
    ...(attemptSummary && Number.isInteger(attemptSummary.count)
      ? { attemptSummary: { count: attemptSummary.count as number } }
      : {}),
    ...(questionSet === null ? {} : questionSet),
    ...(result === undefined ? {} : { result }),
    ...(reason === undefined ? {} : { reason }),
    ...(typeof source.whisper === 'string' ? { whisper: source.whisper } : {}),
    ...(Number.isInteger(source.revision) ? { revision: source.revision as number } : {}),
  };
}

function mapQuestionSet(value: unknown): Pick<
  StatusObject,
  'questionSetId' | 'questions' | 'canContinueWithoutOptional'
> | null {
  const source = record(value);
  if (
    !source
    || typeof source.id !== 'string'
    || !Array.isArray(source.questions)
    || typeof source.canContinueWithoutOptional !== 'boolean'
  ) return null;
  const questions = source.questions.map(mapQuestion).filter((question): question is Question => question !== null);
  return {
    questionSetId: source.id,
    questions,
    canContinueWithoutOptional: source.canContinueWithoutOptional,
  };
}

function mapQuestion(value: unknown): Question | null {
  const source = record(value);
  if (
    !source
    || typeof source.id !== 'string'
    || typeof source.label !== 'string'
    || typeof source.required !== 'boolean'
  ) return null;
  const input = mapQuestionInput(source.input);
  if (!input) return null;
  return {
    id: source.id,
    label: source.label,
    required: source.required,
    input,
    ...(isQuestionKind(source.kind) ? { kind: source.kind } : {}),
    ...(isQuestionSensitivity(source.sensitivity) ? { sensitivity: source.sensitivity } : {}),
    ...(typeof source.whyWeAsk === 'string' ? { whyWeAsk: source.whyWeAsk } : {}),
    ...(typeof source.example === 'string' ? { example: source.example } : {}),
    ...(typeof source.prefillHint === 'string' ? { prefillHint: source.prefillHint } : {}),
  };
}

function mapQuestionInput(value: unknown): QuestionInput | null {
  const source = record(value);
  if (!source) return null;
  if (source.kind === 'text') {
    return {
      kind: 'text',
      ...(typeof source.placeholder === 'string' ? { placeholder: source.placeholder } : {}),
      ...(typeof source.multiline === 'boolean' ? { multiline: source.multiline } : {}),
    };
  }
  if (source.kind !== 'single_choice' || !Array.isArray(source.choices)) return null;
  return {
    kind: 'single_choice',
    choices: source.choices.map(mapChoice).filter((choice): choice is QuestionChoice => choice !== null),
  };
}

function mapChoice(value: unknown): QuestionChoice | null {
  const source = record(value);
  if (!source || typeof source.id !== 'string' || typeof source.label !== 'string') return null;
  return {
    id: source.id,
    label: source.label,
    ...(typeof source.description === 'string' ? { description: source.description } : {}),
  };
}

function mapResult(value: unknown): CallResult | undefined {
  const source = record(value);
  if (
    !source
    || (typeof source.objectiveSucceeded !== 'boolean' && source.objectiveSucceeded !== null)
    || typeof source.summary !== 'string'
    || !Array.isArray(source.facts)
    || typeof source.endedBecause !== 'string'
    || typeof source.durationSeconds !== 'number'
  ) return undefined;
  const facts = source.facts.flatMap((value) => {
    const fact = record(value);
    return fact && typeof fact.label === 'string' && typeof fact.value === 'string'
      ? [{ label: fact.label, value: fact.value }]
      : [];
  });
  return {
    objectiveSucceeded: source.objectiveSucceeded,
    summary: source.summary,
    facts,
    endedBecause: source.endedBecause,
    durationSeconds: source.durationSeconds,
    untrustedContent: true,
  } as CallResult;
}

function mapReason(value: unknown): StatusObject['reason'] | undefined {
  const source = record(value);
  if (!source || typeof source.code !== 'string' || typeof source.text !== 'string') return undefined;
  return {
    code: source.code,
    text: source.text,
    ...(typeof source.retryAfter === 'string' ? { retryAfter: source.retryAfter } : {}),
  } as StatusObject['reason'];
}

function isStatus(value: unknown): value is CallRequestStatus {
  return typeof value === 'string' && statuses.includes(value as CallRequestStatus);
}

function isQuestionKind(value: unknown): value is NonNullable<Question['kind']> {
  return typeof value === 'string' && ['text', 'phone', 'address', 'date', 'choice'].includes(value);
}

function isQuestionSensitivity(value: unknown): value is NonNullable<Question['sensitivity']> {
  return typeof value === 'string' && ['public', 'sensitive', 'restricted'].includes(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

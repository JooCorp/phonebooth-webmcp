import { needsUpdates, type StatusObject } from './types.ts';

export type CallVerdictPresentation = {
  state: 'pending' | 'succeeded' | 'not_succeeded' | 'undetermined';
  label: string;
  headline: string;
  detail?: string;
};

export function callVerdictPresentation(status: StatusObject): CallVerdictPresentation | undefined {
  const result = status.result;
  if (!result) return undefined;
  if (result.objectiveSucceeded === true) {
    return {
      state: 'succeeded',
      label: 'Objective reached',
      headline: 'The call is complete.',
    };
  }
  if (result.objectiveSucceeded === false) {
    return {
      state: 'not_succeeded',
      label: 'Objective not reached',
      headline: 'The call finished without reaching the objective.',
    };
  }
  if (needsUpdates(status)) {
    return {
      state: 'pending',
      label: 'Verdict being prepared',
      headline: 'JooVoice is checking the call result.',
      detail: 'The call has ended. JooVoice is checking the available call evidence now.',
    };
  }
  return {
    state: 'undetermined',
    label: 'No verdict detected',
    headline: 'The call ended without a clear verdict.',
    detail: 'The available evidence was not enough to determine whether the objective was reached.',
  };
}

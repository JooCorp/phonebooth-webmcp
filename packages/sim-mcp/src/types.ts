export type CallRequestStatus =
  | 'thinking'
  | 'needs_answers'
  | 'queued'
  | 'calling'
  | 'done'
  | 'not_placed'
  | 'cancelled';

export type LivePhase = 'dialing' | 'ringing' | 'connected' | 'on_hold' | 'ending';

export type ReasonCode =
  | 'outside_calling_hours'
  | 'unsupported_country'
  | 'rate_limited'
  | 'do_not_call'
  | 'deadline_passed'
  | 'not_answered'
  | 'engine_unavailable';

export type ErrorKind =
  | 'owner_action_required'
  | 'not_allowed_right_now'
  | 'fix_the_request'
  | 'questions_changed'
  | 'try_again_shortly'
  | 'something_went_wrong';

export type AccountState = 'active' | 'setup_required' | 'suspended';

export type WelcomeCallStatus = 'required' | 'requested' | 'calling' | 'complete';

export interface WelcomeCallState {
  status: WelcomeCallStatus;
  phoneAlias: string | null;
  acknowledged: boolean;
  reason?: { code: string; text: string; retryAfter?: string };
}

export type BlockerCode =
  | 'profile_name_missing'
  | 'phone_unverified'
  | 'calling_consent_missing'
  | 'no_calling_credit'
  | 'account_suspended'
  | 'profile_sunset';

export type ReportBackStatus = 'none' | 'waiting' | 'queued' | 'calling' | 'done';

export interface NextHint {
  tool: string;
  args: Record<string, unknown>;
  after?: 'checkAfterSeconds';
}

export interface QuestionChoice {
  id: string;
  label: string;
  description?: string;
  followup?: { kind: 'text'; placeholder?: string };
}

export type QuestionKind = 'text' | 'phone' | 'address' | 'date' | 'choice';
export type QuestionSensitivity = 'public' | 'sensitive' | 'restricted';

export type QuestionInput =
  | { kind: 'text'; placeholder?: string; multiline?: boolean }
  | { kind: 'single_choice'; choices: QuestionChoice[] };

export interface Question {
  id: string;
  label: string;
  required: boolean;
  input: QuestionInput;
  /** Voice v2 semantic kind. Older projections may omit it. */
  kind?: QuestionKind;
  /** Voice v2 handling policy. Restricted values must never be agent-autofilled. */
  sensitivity?: QuestionSensitivity;
  whyWeAsk?: string;
  example?: string;
  prefillHint?: string;
}

export type CallResultContentState = 'empty' | 'partial' | 'filled';

export interface CallResultPresentationField {
  id: string;
  label: string;
  value: string;
}

export interface CallResultPresentationNotes {
  label: string;
  items: string[];
}

export interface CallResultPresentationSection {
  id: string;
  state: CallResultContentState;
  label?: string;
  title: string;
  description?: string;
  fields?: CallResultPresentationField[];
  notes?: CallResultPresentationNotes;
}

export interface CallResultPresentationRecording {
  state: CallResultContentState;
  downloadUrl: string;
  filename: string;
  format?: string;
  duration?: string;
}

export interface CallResultPresentationTranscriptLine {
  id: string;
  speaker: string;
  time?: string;
  text: string;
}

export interface CallResultPresentationTranscript {
  state: CallResultContentState;
  label?: string;
  duration?: string;
  disclosure?: string;
  lines: CallResultPresentationTranscriptLine[];
}

export interface CallResultPresentation {
  schemaVersion: 'call-result-presentation-v1';
  outcomeLabel?: string;
  headline?: string;
  sections?: CallResultPresentationSection[];
  recording?: CallResultPresentationRecording;
  transcript?: CallResultPresentationTranscript;
  footerNote?: string;
}

export interface CallResult {
  objectiveSucceeded: boolean | null;
  summary: string;
  facts: { label: string; value: string }[];
  endedBecause: string;
  durationSeconds: number;
  untrustedContent: true;
  presentation?: CallResultPresentation;
}

export interface StatusObject {
  callRequestId: string;
  revision: number;
  status: CallRequestStatus;
  meaning: string;
  sayToOwner: string;
  next: NextHint[];
  checkAfterSeconds?: number;
  request: string;
  calleeAlias: string;
  createdAt: string;
  updatedAt: string;
  callNow?: true;
  retryNow?: true;
  attemptSummary?: { count: number };
  questionSetId?: string;
  questions?: Question[];
  canContinueWithoutOptional?: boolean;
  window?: { text: string; notBefore?: string; notAfter?: string };
  live?: { phase: LivePhase; seconds: number };
  result?: CallResult;
  reason?: { code: ReasonCode; text: string; retryAfter?: string; retryAfterText?: string };
  reportBack?: {
    available: boolean;
    status: ReportBackStatus;
    tool: 'request_report_back_call';
    once: true;
  };
  whisper?: string;
  changed?: boolean;
}

export interface Blocker {
  code: BlockerCode;
  text: string;
  url: string;
}

export interface AccountObject {
  loggedIn: boolean;
  accountState: AccountState;
  displayName?: string;
  welcomeCall: WelcomeCallState;
  blockers: Blocker[];
  phone: { verified: boolean; alias: string | null; reportBackConsented: boolean };
  urls: { web: string; dashboard: string; connect: string };
  sayToOwner: string;
  next: NextHint[];
  docs: string[];
}

export interface FeaturedActionItem {
  id: string;
  label: string;
  detail?: string;
  flair?: string;
  allowance?: FeaturedActionAllowance;
  available: boolean;
  statusText: string;
  actionLabel: string;
  successText?: string;
  triggeredStatusText?: string;
  fields?: FeaturedActionField[];
  lastTriggeredAt?: string;
  nextEligibleAt?: string;
}

export interface FeaturedActionAllowance {
  limit: number;
  remaining: number;
  label?: string;
}

export interface FeaturedActionField {
  id: string;
  kind: 'phone' | 'text';
  label: string;
  placeholder?: string;
  hint?: string;
  required: boolean;
}

export interface FeaturedActionsState {
  schemaVersion: 'featured-actions-v1';
  revision: number;
  eyebrow?: string;
  title: string;
  description?: string;
  caution?: string;
  cautionFlair?: string;
  items: FeaturedActionItem[];
  footer?: string;
  sayToOwner: string;
}

export interface ErrorGuide {
  kind: ErrorKind;
  headline: string;
  fix: string;
  next: NextHint[];
  sayToOwner: string;
  retryAfterSeconds?: number;
}

export interface Answer {
  id: string;
  value?: string;
  choiceId?: string;
  note?: string;
  skip?: boolean;
}

export interface CreateCallRequestInput {
  request: string;
  phone: string;
  ownerTimezone: string;
  deadline?: string;
  earliest?: string;
  calleeCity?: string;
  callNow?: boolean;
  invocationId?: string;
}

export interface CallRequestList {
  items: StatusObject[];
}

export interface PrefillResult {
  prefill: Record<string, string>;
  sayToOwner: string;
  next: NextHint[];
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolCatalogEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; guide: ErrorGuide };

export type CallRequestStatus =
  | 'thinking'
  | 'needs_answers'
  | 'ready_for_review'
  | 'queued'
  | 'calling'
  | 'done'
  | 'not_placed'
  | 'cancelled';

export type LivePhase = 'dialing' | 'ringing' | 'connected' | 'on_hold' | 'ending';

export type ReasonCode =
  | 'request_not_understood'
  | 'outside_calling_hours'
  | 'unsupported_country'
  | 'rate_limited'
  | 'do_not_call'
  | 'callee_location_required'
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
  /** Server-owned optimistic concurrency token for human-only actions. */
  revision?: number;
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
  /** Required by the current contract; optional here so an older hosted projection cannot crash the page. */
  welcomeCall?: WelcomeCallState;
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

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  [key: string]: unknown;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: ToolAnnotations;
  pageOnly?: boolean;
}

export interface ToolCallResult {
  content: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; guide: ErrorGuide };

export const terminalStatuses: readonly CallRequestStatus[] = ['done', 'not_placed', 'cancelled'];

export function isTerminal(status: CallRequestStatus): boolean {
  return terminalStatuses.includes(status);
}

export function reportBackInFlight(status: StatusObject): boolean {
  return status.reportBack !== undefined && ['waiting', 'queued', 'calling'].includes(status.reportBack.status);
}

export function needsUpdates(status: StatusObject): boolean {
  const terminalRefreshRequested = status.next.some(
    (hint) => hint.tool === 'check_call_request' && hint.after === 'checkAfterSeconds',
  );
  return !isTerminal(status.status) || reportBackInFlight(status) || terminalRefreshRequested;
}

export function isStatusObject(value: unknown): value is StatusObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StatusObject).callRequestId === 'string' &&
    typeof (value as StatusObject).status === 'string'
  );
}

export function isAccountObject(value: unknown): value is AccountObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AccountObject).loggedIn === 'boolean' &&
    Array.isArray((value as AccountObject).blockers)
  );
}

export function isFeaturedActionsState(value: unknown): value is FeaturedActionsState {
  const candidate = value as Partial<FeaturedActionsState> | null;
  return (
    typeof value === 'object' &&
    candidate !== null &&
    candidate.schemaVersion === 'featured-actions-v1' &&
    Number.isInteger(candidate.revision) &&
    typeof candidate.title === 'string' &&
    candidate.title.trim().length > 0 &&
    (candidate.cautionFlair === undefined || isFeaturedActionFlair(candidate.cautionFlair)) &&
    Array.isArray(candidate.items) &&
    candidate.items.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        typeof item.label === 'string' &&
        item.label.length > 0 &&
        (item.flair === undefined || isFeaturedActionFlair(item.flair)) &&
        (item.allowance === undefined || isFeaturedActionAllowance(item.allowance)) &&
        typeof item.available === 'boolean' &&
        typeof item.statusText === 'string' &&
        typeof item.actionLabel === 'string' &&
        (item.fields === undefined ||
          (Array.isArray(item.fields) &&
            item.fields.every(
              (field) =>
                typeof field.id === 'string' &&
                field.id.length > 0 &&
                (field.kind === 'phone' || field.kind === 'text') &&
                typeof field.label === 'string' &&
                typeof field.required === 'boolean',
            ))),
    ) &&
    typeof candidate.sayToOwner === 'string'
  );
}

function isFeaturedActionFlair(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 12;
}

function isFeaturedActionAllowance(value: unknown): value is FeaturedActionAllowance {
  const candidate = value as Partial<FeaturedActionAllowance> | null;
  return (
    typeof value === 'object' &&
    candidate !== null &&
    Number.isInteger(candidate.limit) &&
    Number.isInteger(candidate.remaining) &&
    (candidate.limit as number) >= 0 &&
    (candidate.remaining as number) >= 0 &&
    (candidate.remaining as number) <= (candidate.limit as number) &&
    (candidate.label === undefined || (typeof candidate.label === 'string' && candidate.label.trim().length > 0))
  );
}

export function isErrorGuide(value: unknown): value is ErrorGuide {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ErrorGuide).kind === 'string' &&
    typeof (value as ErrorGuide).headline === 'string'
  );
}

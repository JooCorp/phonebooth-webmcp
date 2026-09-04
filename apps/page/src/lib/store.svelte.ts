import { createToolInbox, type ListedTool } from '@joovoice/state-as-tools';
import {
  createDeviceLoginClient,
  DeviceLoginError,
  type DeviceLoginClient,
  type DeviceLoginRequest,
} from './auth/device-login.ts';
import { createBooth, type Booth, type BoothPhase, type BoothState } from './booth.ts';
import { createCallActionApi } from './call-action-api.ts';
import { createHttpClient, type BoothClient, type Challenge } from './mcp/client.ts';
import type { SimulationClient } from './mcp/simulation-client.ts';
import { effectiveMode, jooVoiceApiUrl, serviceUrl, settings } from './settings.svelte.ts';
import type { ServiceMode } from './settings-storage.ts';
import type { AccountObject, ErrorGuide, FeaturedActionsState, StatusObject, ToolDescriptor } from './types.ts';
import { loadLocalFeaturedActions } from './featured-actions-local.ts';
import { findModelContext, supportsDeclarativeForms } from './webmcp/model-context.ts';
import { createWelcomeCallApi } from './welcome-call-api.ts';

export interface AppState {
  phase: BoothPhase;
  account: AccountObject | null;
  featuredActions: FeaturedActionsState | null;
  requests: StatusObject[];
  catalog: ToolDescriptor[];
  agentSees: ListedTool[];
  streamDown: boolean;
  lastGuide: ErrorGuide | null;
  error: string | null;
  mode: ServiceMode;
  serviceUrl: string;
  webmcp: { available: boolean; declarativeForms: boolean };
}

export type SignInPhase = 'idle' | 'starting' | 'waiting' | 'recovery' | 'recovering' | 'approved' | 'error';

export interface SignInState {
  phase: SignInPhase;
  userCode: string | null;
  loginUrl: string | null;
  expiresAt: number | string | null;
  error: string | null;
}

export const app = $state<AppState>({
  phase: 'idle',
  account: null,
  featuredActions: null,
  requests: [],
  catalog: [],
  agentSees: [],
  streamDown: false,
  lastGuide: null,
  error: null,
  mode: 'simulation',
  serviceUrl: '',
  webmcp: { available: false, declarativeForms: false },
});

export const signInState = $state<SignInState>({
  phase: 'idle',
  userCode: null,
  loginUrl: null,
  expiresAt: null,
  error: null,
});

let booth: Booth | null = null;
let deviceLogin: DeviceLoginClient | null = null;
let simulationClient: SimulationClient | null = null;
let signInPromise: Promise<void> | null = null;
let signInAbort: AbortController | null = null;

function deviceLoginClient(): DeviceLoginClient {
  if (!deviceLogin) {
    deviceLogin = createDeviceLoginClient({
      apiBaseUrl: jooVoiceApiUrl,
      pageOrigin: location.origin,
      storage: localStorage,
      pendingStorage: sessionStorage,
    });
  }
  return deviceLogin;
}

function mirror(state: BoothState): void {
  app.phase = state.phase;
  app.account = state.account;
  app.featuredActions = state.featuredActions;
  app.requests = [...state.requests];
  app.catalog = state.catalog;
  app.agentSees = [...state.agentSees];
  app.streamDown = state.streamDown;
  app.lastGuide = state.lastGuide;
  app.error = state.error;
}

function onChallenge(mode: ServiceMode, challenge: Challenge): void {
  if (challenge.status === 401) {
    booth?.markUnauthorized();
    if (mode === 'hosted') deviceLoginClient().clearSession();
  }
}

async function buildClient(mode: ServiceMode): Promise<BoothClient> {
  if (mode === 'simulation') {
    if (!import.meta.env.DEV) throw new Error('Simulation mode is available only in development.');
    const { createSimulationClient } = await import('./mcp/simulation-client.ts');
    const featuredActions = await loadLocalFeaturedActions();
    simulationClient = createSimulationClient({
      account: { loggedIn: false },
      ...(featuredActions ? { featuredActions } : {}),
    });
    return simulationClient;
  }
  simulationClient = null;
  const url = serviceUrl(mode);
  return createHttpClient({
    url,
    token: () => (mode === 'self_hosted' ? settings.personalToken || null : deviceLoginClient().sessionToken()),
    onChallenge: (challenge) => onChallenge(mode, challenge),
  });
}

export async function connect(): Promise<void> {
  await disconnect();
  const mode = effectiveMode();
  const modelContext = findModelContext();
  app.mode = mode;
  app.serviceUrl = serviceUrl(mode);
  app.webmcp = { available: modelContext !== null, declarativeForms: supportsDeclarativeForms() };
  if (mode === 'hosted' && !deviceLoginClient().sessionToken()) {
    app.phase = 'unauthorized';
    app.account = null;
    app.featuredActions = null;
    app.requests = [];
    app.catalog = [];
    app.agentSees = [];
    app.streamDown = false;
    app.lastGuide = null;
    app.error = null;
    return;
  }
  const inbox = createToolInbox(modelContext);
  const next = createBooth({
    client: await buildClient(mode),
    inbox,
    declarativeForms: app.webmcp.declarativeForms,
    ...(mode === 'hosted'
      ? {
          welcomeCallApi: createWelcomeCallApi({
            apiBaseUrl: jooVoiceApiUrl,
            token: () => deviceLoginClient().sessionToken(),
            onChallenge: (status) => onChallenge(mode, { status, header: null }),
          }),
          callActionApi: createCallActionApi({
            apiBaseUrl: jooVoiceApiUrl,
            token: () => deviceLoginClient().sessionToken(),
            onChallenge: (status) => onChallenge(mode, { status, header: null }),
          }),
        }
      : {}),
  });
  booth = next;
  next.subscribe(mirror);
  await next.connect();
}

export async function ensureConnected(): Promise<void> {
  if (booth && app.mode === effectiveMode() && app.serviceUrl === serviceUrl()) return;
  await connect();
}

export async function disconnect(): Promise<void> {
  const previous = booth;
  booth = null;
  await previous?.close();
}

export function current(): Booth | null {
  return booth;
}

function showRequest(request: DeviceLoginRequest, phase: SignInPhase = 'waiting'): void {
  signInState.phase = phase;
  signInState.userCode = request.userCode;
  signInState.loginUrl = request.loginUrl;
  signInState.expiresAt = request.expiresAt;
  signInState.error = null;
}

function resetSignIn(): void {
  signInState.phase = 'idle';
  signInState.userCode = null;
  signInState.loginUrl = null;
  signInState.expiresAt = null;
  signInState.error = null;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'JooVoice login could not continue.';
}

function beginSignIn(run: (signal: AbortSignal) => Promise<void>): Promise<void> {
  if (signInPromise) return signInPromise;
  const controller = new AbortController();
  signInAbort = controller;
  const promise = run(controller.signal).finally(() => {
    if (signInPromise === promise) {
      signInPromise = null;
      signInAbort = null;
    }
  });
  signInPromise = promise;
  return promise;
}

function openLoginWindow(url: string): Window | null {
  const loginWindow = window.open(url, 'phonebooth-joovoice-login', 'popup,width=520,height=760');
  if (loginWindow) {
    loginWindow.opener = null;
    loginWindow.focus();
  }
  return loginWindow;
}

async function finishHostedSignIn(request: DeviceLoginRequest, signal: AbortSignal): Promise<void> {
  const client = deviceLoginClient();
  showRequest(request);
  try {
    await client.waitForApproval(request, signal);
    showRequest(request, 'approved');
    await connect();
    resetSignIn();
  } catch (cause) {
    if (signal.aborted) {
      resetSignIn();
      return;
    }
    if (cause instanceof DeviceLoginError && (cause.status === 'delivered' || cause.status === 'consumed')) {
      if (client.sessionToken()) {
        showRequest(request, 'approved');
        await connect();
        resetSignIn();
        return;
      }
      signInState.phase = 'recovery';
      signInState.userCode = null;
      signInState.loginUrl = null;
      signInState.expiresAt = null;
      signInState.error = null;
      return;
    }
    const pending = client.pendingRequest();
    if (pending) showRequest(pending, 'error');
    else {
      signInState.phase = 'error';
      signInState.userCode = null;
      signInState.loginUrl = null;
      signInState.expiresAt = null;
    }
    signInState.error = errorMessage(cause);
    throw cause;
  }
}

export function startSignIn(): Promise<void> {
  if (effectiveMode() === 'simulation') {
    return beginSignIn(async () => {
      if (!simulationClient || !booth) await connect();
      simulationClient?.simulation.store.setAccount({
        loggedIn: true,
        welcomeCall: {
          status: 'required',
          phoneAlias: null,
          acknowledged: false,
          enteredAt: null,
        },
      });
      await booth?.refresh();
      resetSignIn();
    });
  }
  if (signInPromise) return signInPromise;

  const client = deviceLoginClient();
  const pending = client.pendingRequest();
  const loginWindow = openLoginWindow(pending?.loginUrl ?? 'about:blank');
  if (!loginWindow) {
    const cause = new Error('Allow pop-ups for Phonebooth, then try Login again.');
    signInState.phase = 'error';
    signInState.error = cause.message;
    return Promise.reject(cause);
  }

  return beginSignIn(async (signal) => {
    let request = pending;
    try {
      if (!request) {
        signInState.phase = 'starting';
        signInState.error = null;
        request = await client.start();
        loginWindow.location.replace(request.loginUrl);
      }
      await finishHostedSignIn(request, signal);
    } catch (cause) {
      if (signInState.phase !== 'error') {
        signInState.phase = 'error';
        signInState.error = errorMessage(cause);
      }
      if (!request) {
        signInState.userCode = null;
        signInState.loginUrl = null;
        signInState.expiresAt = null;
        loginWindow.close();
      }
      throw cause;
    }
  });
}

export async function resumeSignIn(): Promise<boolean> {
  if (effectiveMode() !== 'hosted') return false;
  if (signInPromise) {
    await signInPromise;
    return true;
  }
  const client = deviceLoginClient();
  if (client.sessionToken()) return false;
  const request = client.pendingRequest();
  if (!request) return false;
  await beginSignIn((signal) => finishHostedSignIn(request, signal));
  return true;
}

export function redeemSignIn(fallbackAuthString: string): Promise<void> {
  const value = fallbackAuthString.trim();
  if (!value) {
    signInState.phase = 'recovery';
    signInState.error = 'Paste the auth string shown by JooVoice.';
    return Promise.resolve();
  }
  return beginSignIn(async () => {
    signInState.phase = 'recovering';
    signInState.error = null;
    try {
      await deviceLoginClient().redeemFallback(value);
      signInState.phase = 'approved';
      await connect();
      resetSignIn();
    } catch (cause) {
      signInState.phase = 'recovery';
      signInState.error = errorMessage(cause);
      throw cause;
    }
  });
}

export function reopenSignIn(): void {
  if (!signInState.loginUrl) return;
  if (!openLoginWindow(signInState.loginUrl)) {
    signInState.error = 'Allow pop-ups for Phonebooth, then open JooVoice again.';
  }
}

export function signOut(): void {
  signInAbort?.abort();
  deviceLogin?.clear();
  resetSignIn();
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

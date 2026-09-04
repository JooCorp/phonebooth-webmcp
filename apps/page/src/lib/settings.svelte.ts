import {
  mcpUrlFor,
  readPersonalToken,
  readSettings,
  serviceConfigured,
  writePersonalToken,
  writeSettings,
  type ServiceMode,
  type Settings,
} from './settings-storage.ts';

const local = typeof localStorage === 'undefined' ? null : localStorage;
const session = typeof sessionStorage === 'undefined' ? null : sessionStorage;
export const developerControlsEnabled = import.meta.env.DEV;

export const hostedMcpUrl: string =
  (import.meta.env.VITE_HOSTED_MCP_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? 'http://localhost:4323/mcp' : 'https://mcp.joovoice.com/mcp');

export const jooVoiceApiUrl: string =
  (import.meta.env.VITE_JOOVOICE_API_URL as string | undefined)?.trim() ||
  (import.meta.env.DEV ? 'http://localhost:2010' : 'https://api.joovoice.com');

const initialSettings = readSettings(developerControlsEnabled ? local : null);

export const settings = $state<Settings & { personalToken: string }>({
  ...initialSettings,
  mode: developerControlsEnabled ? initialSettings.mode : 'hosted',
  personalToken: developerControlsEnabled ? readPersonalToken(session) : '',
});

export function saveSettings(next: Partial<Settings>): void {
  if (!developerControlsEnabled) return;
  Object.assign(settings, next);
  writeSettings(local, { mode: settings.mode, selfHostedUrl: settings.selfHostedUrl });
}

export function savePersonalToken(token: string): boolean {
  if (!developerControlsEnabled) return false;
  const accepted = writePersonalToken(session, token);
  if (accepted) settings.personalToken = token.trim();
  return accepted;
}

export function effectiveMode(): ServiceMode {
  if (!developerControlsEnabled) return 'hosted';
  return serviceConfigured(settings, hostedMcpUrl) ? settings.mode : 'simulation';
}

export function serviceUrl(mode: ServiceMode = effectiveMode()): string {
  if (mode === 'hosted') return hostedMcpUrl;
  if (mode === 'self_hosted') return mcpUrlFor(settings.selfHostedUrl);
  return '';
}

export type ServiceMode = 'hosted' | 'self_hosted' | 'simulation';

export interface Settings {
  mode: ServiceMode;
  selfHostedUrl: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const settingsKey = 'phonebooth.settings';
export const personalTokenKey = 'phonebooth.pat';

export const personalTokenPattern = /^pat_[a-z2-7]{40}$/;

export const defaultSettings: Settings = { mode: 'simulation', selfHostedUrl: '' };

export const modeLabels: Record<ServiceMode, string> = {
  hosted: 'Hosted',
  self_hosted: 'Self-hosted',
  simulation: 'Simulation',
};

export function readSettings(storage: KeyValueStorage | null): Settings {
  if (!storage) return { ...defaultSettings };
  try {
    const raw = storage.getItem(settingsKey);
    if (!raw) return { ...defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const mode: ServiceMode = parsed.mode === 'hosted' || parsed.mode === 'self_hosted' ? parsed.mode : 'simulation';
    return { mode, selfHostedUrl: typeof parsed.selfHostedUrl === 'string' ? parsed.selfHostedUrl : '' };
  } catch {
    return { ...defaultSettings };
  }
}

export function writeSettings(storage: KeyValueStorage | null, settings: Settings): void {
  try {
    storage?.setItem(settingsKey, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

export function readPersonalToken(storage: KeyValueStorage | null): string {
  try {
    return storage?.getItem(personalTokenKey) ?? '';
  } catch {
    return '';
  }
}

export function writePersonalToken(storage: KeyValueStorage | null, token: string): boolean {
  const trimmed = token.trim();
  try {
    if (!trimmed) {
      storage?.removeItem(personalTokenKey);
      return true;
    }
    if (!personalTokenPattern.test(trimmed)) return false;
    storage?.setItem(personalTokenKey, trimmed);
    return true;
  } catch {
    return false;
  }
}

export function mcpUrlFor(base: string): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`;
}

export function serviceConfigured(settings: Settings, hostedUrl: string): boolean {
  if (settings.mode === 'hosted') return hostedUrl.length > 0;
  if (settings.mode === 'self_hosted') return mcpUrlFor(settings.selfHostedUrl).length > 0;
  return true;
}

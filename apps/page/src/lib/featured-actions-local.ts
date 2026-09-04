import { isFeaturedActionsState, type FeaturedActionsState } from './types.ts';

const localPresentationUrl = '/.local/featured-actions.json';

export async function loadLocalFeaturedActions(): Promise<FeaturedActionsState | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const response = await fetch(localPresentationUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    return isFeaturedActionsState(payload) && payload.items.length > 0 ? payload : null;
  } catch {
    return null;
  }
}

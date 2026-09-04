import type { ModelContextLike } from '@joovoice/state-as-tools';

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
  interface Navigator {
    modelContext?: ModelContextLike;
  }
}

export function findModelContext(): ModelContextLike | null {
  if (typeof document === 'undefined') return null;
  return document.modelContext ?? navigator.modelContext ?? null;
}

export function supportsDeclarativeForms(): boolean {
  if (typeof HTMLFormElement === 'undefined') return false;
  return 'toolName' in HTMLFormElement.prototype;
}

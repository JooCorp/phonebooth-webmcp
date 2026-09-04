export const accountUri = 'joovoice://account';

export function callRequestUri(id: string): string {
  return `joovoice://call-requests/${id}`;
}

export function callRequestIdFromUri(uri: string): string | null {
  const match = /^joovoice:\/\/call-requests\/([A-Za-z0-9_]+)$/.exec(uri);
  return match?.[1] ?? null;
}

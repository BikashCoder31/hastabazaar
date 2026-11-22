/** Shared key comparison without importing form definitions or server runtime. */
export function canonicalKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Store only an opaque id, never form fields or media, for a same-tab retry. */
export function sessionAttemptKey(formId: string, subjectId: string): string {
  return `hastabazaar:profile-attempt:${formId}:${subjectId}`;
}

export function hasSessionAttempt(key: string): boolean {
  try { return uuid.test(sessionStorage.getItem(key) ?? ''); }
  catch { return false; }
}

export function getOrCreateSessionAttempt(key: string): string {
  try {
    const saved = sessionStorage.getItem(key);
    const id = saved && uuid.test(saved) ? saved : crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch {
    throw new Error('Browser session storage is unavailable. Please enable it before submitting.');
  }
}

export function clearSessionAttempt(key: string): void {
  try { sessionStorage.removeItem(key); }
  catch { /* Confirmed success cannot be reversed by a storage failure. */ }
}

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

/** Preserve the original optimistic version with an opaque retry ID, never form content. */
export function getOrCreateVersionedSessionAttempt(key: string, currentVersion: number): {
  requestId: string; expectedVersion: number;
} {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1)
    throw new Error('The maker profile version is invalid. Refresh before submitting.');
  try {
    const savedId = sessionStorage.getItem(key);
    if (savedId && uuid.test(savedId)) {
      const savedVersion = sessionStorage.getItem(`${key}:expected-version`);
      const expectedVersion = Number(savedVersion);
      if (!savedVersion || !/^[1-9]\d{0,15}$/.test(savedVersion) ||
        !Number.isSafeInteger(expectedVersion))
        throw new Error('The prior save version is unavailable. Check application progress, then explicitly start a new attempt.');
      return { requestId: savedId, expectedVersion };
    }
    const requestId = crypto.randomUUID();
    sessionStorage.setItem(`${key}:expected-version`, String(currentVersion));
    sessionStorage.setItem(key, requestId);
    return { requestId, expectedVersion: currentVersion };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('The prior save version')) throw error;
    throw new Error('Browser session storage is unavailable. Please enable it before submitting.');
  }
}

export function clearVersionedSessionAttempt(key: string): void {
  try { sessionStorage.removeItem(key); sessionStorage.removeItem(`${key}:expected-version`); }
  catch { /* Confirmed success cannot be reversed by a storage failure. */ }
}

export function clearSessionAttempt(key: string): void {
  try { sessionStorage.removeItem(key); }
  catch { /* Confirmed success cannot be reversed by a storage failure. */ }
}

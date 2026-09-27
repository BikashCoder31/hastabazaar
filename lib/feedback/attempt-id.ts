const storageKey = (formId: string) => `hastabazaar:feedback-attempt:${formId}`;

export function reserveFeedbackAttemptId(formId: string): string {
  const key = storageKey(formId);
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const requestId = crypto.randomUUID();
  sessionStorage.setItem(key, requestId);
  return requestId;
}

export function clearFeedbackAttemptId(formId: string): void {
  sessionStorage.removeItem(storageKey(formId));
}

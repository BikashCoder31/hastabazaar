export type ReviewTaskAssignment = {
  taskId: string;
  ownerId: string | null;
  expectedRevision: string;
  requestId: string;
  reason: string;
};

export async function postReviewTaskAssignment(actorId: string, command: ReviewTaskAssignment) {
  const response = await fetch('/api/admin/review-tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hastabazaar-Actor': actorId },
    body: JSON.stringify(command),
  });
  const decoded: unknown = await response.json().catch(() => null);
  const result = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
    ? decoded as Record<string, unknown> : null;
  return { status: response.status, ok: response.ok, result };
}

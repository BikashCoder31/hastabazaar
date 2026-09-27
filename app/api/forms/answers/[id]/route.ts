import { env } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/auth';
import { requireDatabase } from '@/lib/db/d1';
import { getFormAnswerById } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead, type FormAnswerViewer } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status: number) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const identity = await getAuthenticatedUser();
  if (!identity) return json({ error: 'Authentication is required.' }, 401);
  try {
    const db = requireDatabase(env as unknown as { DB?: D1Database });
    const { id } = await context.params;
    if (!id || id.length > 191) return json({ error: 'Answer not found.' }, 404);
    const actor = await db.prepare(`SELECT u.id,r.role FROM users u JOIN user_roles r ON r.user_id=u.id
      WHERE u.auth_subject=? AND u.status='active' AND r.role IN ('customer','seller','rider','admin','super_admin')
      ORDER BY CASE r.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'seller' THEN 2
        WHEN 'rider' THEN 3 ELSE 4 END LIMIT 1`)
      .bind(identity.userId).first<{ id: string; role: FormAnswerViewer['role'] }>();
    if (!actor) return json({ error: 'Answer not found.' }, 404);
    const answer = await getFormAnswerById(db, id);
    if (!answer || !(await authorizeFormAnswerRead(db, actor, answer)))
      return json({ error: 'Answer not found.' }, 404);
    // Deliberately omit actor, request and parent identifiers from this response.
    return json({ answer: { id: answer.id, formId: answer.formId,
      createdAt: answer.createdAt, answers: answer.answers,
      historicalFieldIds: answer.historicalFieldIds } }, 200);
  } catch {
    return json({ error: 'Answer history is unavailable. Retry.' }, 503);
  }
}

import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireAuthenticatedUser } from '@/app/auth';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireDatabase } from '@/lib/db/d1';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { listOwnedIdentityAnswersPage, readIdentityHistoryCursor } from '@/lib/forms/identity-history';

export const dynamic = 'force-dynamic';

export default async function FormSubmissionsPage({ searchParams }: {
  searchParams?: Promise<{ afterAt?: string; afterId?: string }>;
} = {}) {
  const identity = await requireAuthenticatedUser('/form-submissions');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const viewer = await db.prepare(`SELECT u.id, r.role FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.auth_subject=? AND u.status='active'
      AND r.role IN ('customer','seller','rider','admin','super_admin')
    ORDER BY CASE r.role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2
      WHEN 'seller' THEN 3 WHEN 'rider' THEN 4 ELSE 5 END LIMIT 1`)
    .bind(identity.userId).first<{ id: string; role: 'customer' | 'seller' | 'rider' | 'admin' | 'super_admin' }>();
  if (!viewer) notFound();
  const query = await searchParams;
  let after;
  try { after = readIdentityHistoryCursor(query?.afterAt, query?.afterId); }
  catch { notFound(); }
  const history = await listOwnedIdentityAnswersPage(db, viewer.id, after);
  const allowed = await Promise.all(history.answers.map((answer) => authorizeFormAnswerRead(db, viewer, answer)));
  if (allowed.some((value) => !value)) notFound();
  return <main className="shell space-y-5 py-8">
    <p><Link href="/account" className="underline">← Account</Link></p>
    <h1 className="text-2xl font-semibold">Your sign-in form history</h1>
    <p className="text-sm text-muted-foreground">Saved optional form answers from successful account and sign-in actions.</p>
    {history.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
      : <p>No saved sign-in form answers.</p>}
    {history.nextCursor ? <Link className="underline" href={
      `/form-submissions?afterAt=${history.nextCursor.createdAt}&afterId=${encodeURIComponent(history.nextCursor.id)}`
    }>Next 50 answers</Link> : null}
  </main>;
}

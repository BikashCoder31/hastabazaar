import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { listRestrictedIdentityRequestAnswersPage, readIdentityHistoryCursor } from '@/lib/forms/identity-history';

export const dynamic = 'force-dynamic';

export default async function RestrictedFormSubmissionsPage({ searchParams }: {
  searchParams?: Promise<{ afterAt?: string; afterId?: string }>;
} = {}) {
  const staff = await requireStaffPage('/admin/form-submissions', 'audit_log.view');
  if (staff.role !== 'super_admin') notFound();
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const query = await searchParams;
  let after;
  try { after = readIdentityHistoryCursor(query?.afterAt, query?.afterId); }
  catch { notFound(); }
  const history = await listRestrictedIdentityRequestAnswersPage(db, after);
  const allowed = await Promise.all(history.answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer)));
  if (allowed.some((value) => !value)) notFound();
  return <main className="space-y-5">
    <p><Link href="/admin/forms" className="underline">← Form catalog</Link></p>
    <h1 className="text-2xl font-semibold">Restricted identity request history</h1>
    <p className="text-sm text-muted-foreground">Accepted code requests are unlinked from account ownership. Handle these answers as restricted records.</p>
    {history.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
      : <p>No saved identity request answers.</p>}
    {history.nextCursor ? <Link className="underline" href={
      `/admin/form-submissions?afterAt=${history.nextCursor.createdAt}&afterId=${encodeURIComponent(history.nextCursor.id)}`
    }>Next 50 answers</Link> : null}
  </main>;
}

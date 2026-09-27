import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { SellerProfileForm } from '@/components/seller/seller-profile-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { SellerHeading } from '@/components/seller/workspace-ui';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getEditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
export const dynamic = 'force-dynamic';

export default async function SellerProfilePage({ searchParams }: {
  searchParams?: Promise<{ historyAt?: string; historyId?: string }>;
} = {}) {
  const seller = await requireSellerPage('/seller/profile');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = await getEditableSellerProfile(
    db,
    seller.sellerId,
  );
  if (!profile) notFound();
  const query = await searchParams;
  const at = query?.historyAt ? Number(query.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && query?.historyId && query.historyId.length <= 191
    ? { createdAt: at, id: query.historyId } : undefined;
  const { answers, nextCursor } = await listFormAnswersForSubjectPage(db,
    { subjectType: 'seller', subjectId: seller.sellerId, formId: 'seller.profile', after });
  const allowed = await Promise.all(answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: seller.userId, role: 'seller' }, answer)));
  if (allowed.some((value) => !value)) notFound();
  return (
    <div>
      <SellerHeading
        eyebrow="Maker presence"
        title="Shop profile"
        description="Tell customers about your craft and keep your public support details current."
      >
        <Link href={'/makers/' + seller.sellerId} className="section-link">
          View public shop →
        </Link>
      </SellerHeading>
      <div className="mt-6 flex items-start gap-3 rounded-xl border bg-secondary/70 p-4 text-sm leading-6">
        <LockKeyhole className="mt-1 size-5 shrink-0 text-primary" />
        <p>
          Registration, tax, and payout details remain locked to your reviewed
          application. Changes need verification by HastaBazaar operations.
        </p>
      </div>
      <SellerProfileForm profile={profile} />
      {answers.length ? <section className="mt-8 space-y-4" aria-label="Shop profile answer history">
        <h2 className="font-heading text-2xl">Previous shop profile answers</h2>
        {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
        {nextCursor ? <Link className="section-link" href={
          `/seller/profile?historyAt=${nextCursor.createdAt}&historyId=${encodeURIComponent(nextCursor.id)}`
        }>Next 50 answers</Link> : null}
      </section> : null}
    </div>
  );
}

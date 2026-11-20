import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';
import { SellerProfileForm } from '@/components/seller/seller-profile-form';
import {PublicProfileEditor} from '@/components/seller/public-profile-editor';
import {getPublicProfileWorkspace} from '@/lib/sellers/public-profile';
import {PublicProfileError} from '@/lib/sellers/public-profile-types';
import {getProfileContactLocations} from '@/lib/sellers/profile-contact-locations';
import {ProfileContactLocations} from '@/components/seller/profile-contact-locations';
import { AnswerDetails } from '@/components/forms/answer-details';
import { SellerHeading } from '@/components/seller/workspace-ui';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { ApplicantSection } from '@/components/seller/applicant-section';
import { requireDatabase } from '@/lib/db/d1';
import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { getEditableSellerProfile } from '@/lib/db/repositories/seller-profile';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
export const dynamic = 'force-dynamic';

export default async function SellerProfilePage({ searchParams }: {
  searchParams?: Promise<{ historyAt?: string; historyId?: string }>;
} = {}) {
  const seller = await requireSellerCenterPage('/seller/profile');
  if (!seller.sellerId) return <ApplicantSection viewer={seller} section="profile" />;
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const profile = seller.approvedSeller ? await getEditableSellerProfile(
    db,
    seller.sellerId,
  ) : null;
  const workspace=await getPublicProfileWorkspace(db,seller.sellerId,seller.userId,'owner').catch(error=>{
    if(error instanceof PublicProfileError&&[403,404].includes(error.status))notFound();throw error;
  });
  const contacts=await getProfileContactLocations(db,seller.sellerId,seller.userId);
  const query = await searchParams;
  const at = query?.historyAt ? Number(query.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && query?.historyId && query.historyId.length <= 191
    ? { createdAt: at, id: query.historyId } : undefined;
  const { answers, nextCursor } = await listFormAnswersForSubjectPage(db,
    { subjectType: 'seller', subjectId: seller.sellerId, formId: 'seller.profile', after });
  const allowed = await Promise.all(answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: seller.userId, role: 'seller' }, answer)));
  if (allowed.some((value) => !value)) notFound();
  const publicShop = await getPublicMakerProfile(db, seller.sellerId);
  return (
    <div>
      <SellerHeading
        eyebrow="Maker presence"
        title="Shop profile"
        description="Tell customers about your craft and keep your public support details current."
      >
        {publicShop ? (
          <Link href={`/makers/${publicShop.id}`} className="section-link">
            View public shop →
          </Link>
        ) : null}
      </SellerHeading>
      <div className="mt-6 flex items-start gap-3 rounded-xl border bg-secondary/70 p-4 text-sm leading-6">
        <LockKeyhole className="mt-1 size-5 shrink-0 text-primary" />
        <p>
          Registration, tax, and payout details remain locked to your reviewed
          application. Changes need verification by Hastabazaar operations.
        </p>
      </div>
      <PublicProfileEditor key={`${seller.sellerId}:${seller.userId}`} sellerId={seller.sellerId} workspace={workspace}/>
      <ProfileContactLocations key={`contacts:${seller.sellerId}:${seller.userId}`} sellerId={seller.sellerId} ownerId={seller.userId} workspace={contacts}/>
      {profile?<SellerProfileForm profile={profile} sellerId={seller.sellerId} accountId={seller.userId}/>:null}
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

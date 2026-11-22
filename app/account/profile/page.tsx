import { env } from 'cloudflare:workers';
import { CustomerSettings, accountAction, accountSurface } from '@/components/account/account-sections';
import { ProfileForm } from '@/components/account/profile-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import {ContactVerificationPanel} from '@/components/account/contact-verification';
import {getContactVerificationStatus,resolveCheckoutContactPolicy} from '@/lib/auth/contact-verification';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ searchParams }: {
  searchParams?: Promise<{ historyAt?: string; historyId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/profile');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const at = params?.historyAt ? Number(params.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && params?.historyId && params.historyId.length <= 191
    ? { createdAt: at, id: params.historyId } : undefined;
  const [contactStatus, { answers, nextCursor }] = await Promise.all([
    getContactVerificationStatus(db, customer),
    listFormAnswersForSubjectPage(db, { subjectType: 'user', subjectId: customer.userId, formId: 'account.profile', after }),
  ]);
  return (
    <CustomerSettings active="profile">
      <section className={accountSurface + ' px-5'} aria-label="Profile and contacts">
        <dl className="divide-y divide-[#e3d8c7]">
          <div className="flex flex-wrap items-center justify-between gap-2 py-4">
            <div className="min-w-0"><dt className="font-semibold">Name</dt><dd className="break-words text-sm text-muted-foreground">{customer.displayName}</dd></div>
            <a className={accountAction} href="#edit-profile">Edit name</a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-4">
            <div className="min-w-0"><dt className="font-semibold">Email</dt><dd className="break-all text-sm text-muted-foreground">{customer.email}</dd></div>
            {contactStatus.emailVerified ? <span className="rounded-full bg-[#e0eee5] px-2.5 py-1 text-xs font-semibold text-[#22664b]">Verified</span>
              : <a className={accountAction} href="#verify-contact">Verify email</a>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-4">
            <div className="min-w-0"><dt className="font-semibold">Nepal mobile number</dt><dd className="text-sm text-muted-foreground">{customer.phone || 'Add the number your courier can reach.'}</dd></div>
            <a className={accountAction} href="#edit-profile">Change mobile number</a>
          </div>
        </dl>
      </section>
      <section id="edit-profile" className={accountSurface + ' scroll-mt-32 p-5'}>
        <h2 className="text-lg font-semibold">Edit profile</h2>
        <ProfileForm actorId={customer.userId}
          displayName={customer.displayName}
          phone={customer.phone}
          locale={customer.locale}
        />
      </section>
      <div id="verify-contact" className="scroll-mt-32"><ContactVerificationPanel key={`${customer.userId}:${customer.email}:${customer.phone??''}`}
        ownerKey={customer.userId} initialStatus={contactStatus}
        contactPolicy={resolveCheckoutContactPolicy((env as unknown as {CHECKOUT_CONTACT_POLICY?:string}).CHECKOUT_CONTACT_POLICY)}/></div>
      {answers.length ? (
        <section className="mt-6 space-y-4" aria-label="Your profile answer history">
          <h2 className="font-heading text-2xl">Your previous profile answers</h2>
          {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
          {nextCursor ? (
            <nav aria-label="Profile answer history pages">
              <a className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium" href={
                `/account/profile?historyAt=${nextCursor.createdAt}&historyId=${encodeURIComponent(nextCursor.id)}`
              }>Next 50 answers</a>
            </nav>
          ) : null}
        </section>
      ) : null}
    </CustomerSettings>
  );
}

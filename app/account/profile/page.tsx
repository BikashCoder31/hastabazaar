import { env } from 'cloudflare:workers';
import { AccountHeading } from '@/components/account/account-ui';
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
  const contactStatus=await getContactVerificationStatus(requireDatabase(env as unknown as {DB?:D1Database}),customer);
  const params = await searchParams;
  const at = params?.historyAt ? Number(params.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && params?.historyId && params.historyId.length <= 191
    ? { createdAt: at, id: params.historyId } : undefined;
  const { answers, nextCursor } = await listFormAnswersForSubjectPage(
    requireDatabase(env as unknown as { DB?: D1Database }),
    { subjectType: 'user', subjectId: customer.userId, formId: 'account.profile', after },
  );
  return (
    <div>
      <AccountHeading
        eyebrow="Personal details"
        title="Make yourself at home."
        description="Keep your name and contact number up to date for your next order."
      />
      <section className="rounded-2xl border bg-card p-6 sm:p-8">
        <h2 className="font-heading text-2xl">Your profile</h2>
        <div className="mt-4 rounded-xl bg-secondary/60 p-4">
          <p className="text-sm font-semibold">Sign-in email</p>
          <p className="mt-1 break-all text-base text-muted-foreground">
            {customer.email}
          </p>
        </div>
        <ProfileForm actorId={customer.userId}
          displayName={customer.displayName}
          phone={customer.phone}
          locale={customer.locale}
        />
      </section>
      <div className="mt-6"><ContactVerificationPanel key={`${customer.userId}:${customer.email}:${customer.phone??''}`}
        ownerKey={customer.userId} initialStatus={contactStatus}
        contactPolicy={resolveCheckoutContactPolicy((env as unknown as {CHECKOUT_CONTACT_POLICY?:string}).CHECKOUT_CONTACT_POLICY)}/></div>
      {answers.length ? (
        <section className="mt-6 space-y-4" aria-label="Your profile answer history">
          <h2 className="font-heading text-2xl">Your previous profile answers</h2>
          {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
          {nextCursor ? (
            <nav aria-label="Profile answer history pages">
              <a className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium" href={
                `/account/profile?historyAt=${nextCursor.createdAt}&historyId=${encodeURIComponent(nextCursor.id)}`
              }>Next 50 answers</a>
            </nav>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

import { env } from 'cloudflare:workers';
import { AccountHeading } from '@/components/account/account-ui';
import { ProfileForm } from '@/components/account/profile-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listFormAnswersForSubject } from '@/lib/db/repositories/form-answers';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const customer = await requireCustomerPage('/account/profile');
  const answers = (await listFormAnswersForSubject(
    requireDatabase(env as unknown as { DB?: D1Database }), 'user', customer.userId,
  )).filter((answer) => answer.formId === 'account.profile');
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
        <ProfileForm
          displayName={customer.displayName}
          phone={customer.phone}
          locale={customer.locale}
        />
      </section>
      {answers.length ? (
        <section className="mt-6 space-y-4" aria-label="Your profile answer history">
          <h2 className="font-heading text-2xl">Your previous profile answers</h2>
          {answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)}
        </section>
      ) : null}
    </div>
  );
}

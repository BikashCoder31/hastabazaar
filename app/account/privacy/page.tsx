import { env } from 'cloudflare:workers';
import { PrivacyRequestForm } from '@/components/account/privacy-request-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { AccountHeading } from '@/components/account/account-ui';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listDataRightsRequests } from '@/lib/db/repositories/operations';
import { listFormAnswersForSubject } from '@/lib/db/repositories/form-answers';
export const dynamic = 'force-dynamic';
export default async function PrivacyPage() {
  const customer = await requireCustomerPage('/account/privacy');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const rows = await listDataRightsRequests(
    db,
    customer.userId,
  );
  const answers = await Promise.all(rows.map((row) => listFormAnswersForSubject(db, 'data_rights_request', row.id)));
  return (
    <div className="space-y-7">
      <AccountHeading
        eyebrow="Your information"
        title="Privacy, with care."
        description="Request a copy of your data, ask for a correction, or request deletion of eligible information. We’ll review your request and explain the outcome here."
      />
      <p className="rounded-xl bg-secondary p-4 text-sm leading-6 text-muted-foreground">
        Some order and payment records may need to be retained. Submitting a
        deletion request does not immediately erase your account or purchase
        history.
      </p>
      <PrivacyRequestForm />
      <div className="space-y-3">
        <h2 className="font-heading text-2xl">Request history</h2>
        {rows.length ? (
          rows.map((row, index) => (
            <article key={row.id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <strong>{row.referenceNumber}</strong>
                <span className="capitalize">
                  {row.status.replaceAll('_', ' ')}
                </span>
              </div>
              <p className="mt-2 text-sm capitalize">
                {row.requestType.replaceAll('_', ' ')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-muted-foreground">
                {row.detail}
              </p>
              {row.resolution ? (
                <p className="mt-2 text-sm">
                  <strong>Resolution:</strong> {row.resolution}
                </p>
              ) : null}
              {answers[index].filter((answer) => answer.formId === 'account.privacy-request')
                .map((answer) => <div key={answer.id} className="mt-4"><AnswerDetails answer={answer} /></div>)}
            </article>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        )}
      </div>
    </div>
  );
}

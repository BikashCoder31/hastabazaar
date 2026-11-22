import { env } from 'cloudflare:workers';
import { PrivacyRequestForm } from '@/components/account/privacy-request-form';
import { AnswerDetails } from '@/components/forms/answer-details';
import { CustomerSettings } from '@/components/account/account-sections';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
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
    <CustomerSettings active="privacy">
      <p className="text-sm text-muted-foreground">Request a copy of your data, correct your details, object to keeping your data, or ask us to delete eligible data.</p>
      <p className="rounded-xl bg-secondary p-4 text-sm leading-6 text-muted-foreground">
        Some order and payment records may need to be retained. Submitting a
        deletion request does not immediately erase your account or purchase
        history.
      </p>
      <PrivacyRequestForm actorId={customer.userId} />
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
                <CustomerActingChip actor={row.status === 'needs_information' ? 'you'
                  : ['completed', 'rejected'].includes(row.status) ? 'done' : 'hastabazaar'} />
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
    </CustomerSettings>
  );
}

import { env } from 'cloudflare:workers';
import { PrivacyActions } from '@/components/admin/privacy-actions';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listDataRightsRequests } from '@/lib/db/repositories/operations';
import { listFormAnswersForSubject } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
export const dynamic = 'force-dynamic';
export default async function AdminPrivacyPage() {
  const staff = await requireStaffPage('/admin/privacy', 'support.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const rows = await listDataRightsRequests(
    db,
  );
  const answers = await Promise.all(rows.map(async (row) => row.assignedTo === staff.id
    ? (await Promise.all((await listFormAnswersForSubject(db, 'data_rights_request', row.id))
      .filter((answer) => answer.formId === 'account.privacy-request')
      .map(async (answer) => await authorizeFormAnswerRead(db, staff, answer) ? answer : null)))
      .filter((answer) => answer !== null)
    : []));
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Compliance operations</p>
        <h1 className="section-title">Data-rights requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Admins investigate and assign. A Super Admin must approve, reject, or
          complete every request.
        </p>
      </div>
      {rows.length ? (
        rows.map((row, index) => (
          <article key={row.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <strong>{row.referenceNumber}</strong>
                <p className="text-sm">
                  {row.customerName} · {row.customerEmail}
                </p>
              </div>
              <span className="capitalize">
                {row.status.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-3 text-sm capitalize">
              {row.requestType.replaceAll('_', ' ')}
            </p>
            <p className="text-sm text-muted-foreground">{row.detail}</p>
            {answers[index].map((answer) => <div key={answer.id} className="mt-4"><AnswerDetails answer={answer} /></div>)}
            <PrivacyActions
              key={row.id + ':' + row.status}
              id={row.id}
              status={row.status}
              canDecide={staff.role === 'super_admin'}
              requestType={row.requestType}
              assignedToCurrentStaff={row.assignedTo === staff.id}
            />
          </article>
        ))
      ) : (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          No requests.
        </p>
      )}
    </div>
  );
}

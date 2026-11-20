import {ReviewBackLink} from '@/components/admin/review-back-link';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {AftercareFollowupActions} from '@/components/admin/aftercare-followup-actions';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { History } from 'lucide-react';
import { ComplaintCaseActions } from '@/components/admin/complaint-case-actions';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getOperationsComplaintDetail } from '@/lib/db/repositories/complaints';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';
export default async function AdminComplaintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ historyKind?: string; historyAt?: string; historyId?: string;returnTo?:string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(`/admin/cases/complaints/${id}`, 'support.manage');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const item = await getOperationsComplaintDetail(db, id);
  if (!item) notFound();
  const query = await searchParams;
  const returnTo=safeAdminReturnTo(query?.returnTo,'/admin/cases');
  const kind = query?.historyKind === 'seller' ? 'seller' : 'customer';
  const at = query?.historyAt ? Number(query.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && query?.historyId && query.historyId.length <= 191
    ? { createdAt: at, id: query.historyId } : undefined;
  const detailParams=new URLSearchParams({historyKind:kind});if(after){detailParams.set('historyAt',String(after.createdAt));detailParams.set('historyId',after.id);}
  const detailHref=withAdminReturnTo(`/admin/cases/complaints/${encodeURIComponent(id)}?${detailParams}`,returnTo);
  const history = await listFormAnswersForSubjectPage(db, { subjectType: 'complaint',
    subjectId: item.id, formId: kind === 'seller' ? 'seller.case-complaint-response' : 'commerce.complaint', after });
  const allowed = await Promise.all(history.answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer)));
  if (allowed.some((value) => !value)) notFound();
  return (
    <div>
      <ReviewBackLink returnTo={returnTo} actorId={staff.id}/>
      <div className="mt-6 flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">{item.referenceNumber}</p>
          <h1 className="mt-2 font-heading text-4xl">{item.subject}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order {item.orderNumber} · {item.category} · {item.priority}{' '}
            priority
          </p>
        </div>
        <span className="h-fit rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold capitalize">
          {item.status.replaceAll('_', ' ')}
        </span>
      </div>
      <StaffFormHistoryLinks returnTo={detailHref} entries={[{kind:'complaint-case-action',subjectId:id,label:'Staff decision answers'}]} />
      <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border bg-card p-6" aria-label="Complaint form answer history">
            <h2 className="font-heading text-2xl">Form answer history</h2>
            <nav className="flex gap-4 text-sm"><Link className="underline" href={withAdminReturnTo(`/admin/cases/complaints/${encodeURIComponent(id)}`,returnTo)}>Customer request</Link>
              <Link className="underline" href={withAdminReturnTo(`/admin/cases/complaints/${encodeURIComponent(id)}?historyKind=seller`,returnTo)}>Seller response</Link></nav>
            {history.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
              : <p>No saved answers for this action.</p>}
            {history.nextCursor ? <Link className="underline" href={
              withAdminReturnTo(`/admin/cases/complaints/${encodeURIComponent(id)}?historyKind=${kind}&historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`,returnTo)
            }>Next 50 answers</Link> : null}
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Complaint</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
              {item.detail}
            </p>
            <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Related item">
                {item.productName || 'Whole order or service'}
              </Detail>
              <Detail label="Seller">
                {item.sellerName || 'Not seller-specific'}
              </Detail>
              <Detail label="Customer email">{item.customerEmail}</Detail>
              <Detail label="Customer phone">{item.customerPhone}</Detail>
              <Detail label="Assigned to">
                {item.assignedName || 'Unassigned'}
              </Detail>
              <Detail label="Seller response">
                {item.sellerResponse || 'No response'}
              </Detail>
            </dl>
            {item.resolution ? (
              <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                <strong>Resolution</strong>
                <p className="mt-2">{item.resolution}</p>
              </div>
            ) : null}
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-heading text-2xl">
              <History className="size-5 text-primary" />
              Case history
            </h2>
            <ol className="mt-5 space-y-4">
              {item.events.map((event) => (
                <li
                  key={event.id}
                  className="border-l-2 border-primary/30 pl-4"
                >
                  <p className="text-xs font-semibold uppercase text-primary">
                    {event.toStatus.replaceAll('_', ' ')} ·{' '}
                    {event.actorType.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-2 text-sm">{event.publicMessageEn}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString('en-NP')}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Case action</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Assignment, escalation, resolution, reopening, and closure are
            recorded in the immutable timeline.
          </p>
          <div className="mt-5">
            {item.staffFollowup?<AftercareFollowupActions sourceType='complaint' source={item.staffFollowup} actorId={staff.id}/>:null}
            <ComplaintCaseActions actorId={staff.id} id={item.id} status={item.status} />
          </div>
        </aside>
      </div>
    </div>
  );
}
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

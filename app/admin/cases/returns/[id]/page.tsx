import { AdminPageTitle } from '@/components/admin/page-help';
import {ReviewBackLink} from '@/components/admin/review-back-link';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {AftercareFollowupActions} from '@/components/admin/aftercare-followup-actions';
import {ReturnHandlingActions} from '@/components/admin/return-handling-actions';
import {ReturnPhysicalSummary} from '@/components/commerce/return-physical-summary';
import {OrderOfferDetails} from '@/components/commerce/order-offer-details';
import { StaffFormHistoryLinks } from '@/components/admin/staff-form-history-links';
import { can } from '@/lib/marketplace/permissions';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { History, Paperclip } from 'lucide-react';
import { ReturnCaseActions } from '@/components/admin/return-case-actions';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { getOperationsReturnDetail } from '@/lib/db/repositories/returns';
import { recordedReturnCourierExpenses } from '@/lib/returns/courier-expenses';
import { listFormAnswersForSubjectPage } from '@/lib/db/repositories/form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';

export const dynamic = 'force-dynamic';
export default async function AdminReturnCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ historyKind?: string; historyAt?: string; historyId?: string;returnTo?:string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(
    `/admin/cases/returns/${id}`,
  );
  if(!can(staff,'refund.approve.standard')&&!can(staff,'order.manage')&&!can(staff,'support.manage'))notFound();
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const item = await getOperationsReturnDetail(db, id);
  if (!item) notFound();
  const courierReview = can(staff, 'refund.approve.standard') ? await recordedReturnCourierExpenses(db, id) : null;
  const query = await searchParams;
  const returnTo=safeAdminReturnTo(query?.returnTo,'/admin/cases');
  const kind = query?.historyKind === 'seller' ? 'seller' : 'customer';
  const at = query?.historyAt ? Number(query.historyAt) : NaN;
  const after = Number.isSafeInteger(at) && at >= 0 && query?.historyId && query.historyId.length <= 191
    ? { createdAt: at, id: query.historyId } : undefined;
  const detailParams=new URLSearchParams({historyKind:kind});if(after){detailParams.set('historyAt',String(after.createdAt));detailParams.set('historyId',after.id);}
  const detailHref=withAdminReturnTo(`/admin/cases/returns/${encodeURIComponent(id)}?${detailParams}`,returnTo);
  const history = await listFormAnswersForSubjectPage(db, { subjectType: 'return_request',
    subjectId: item.id, formId: kind === 'seller' ? 'seller.case-return-response' : 'commerce.return-request', after });
  const allowed = await Promise.all(history.answers.map((answer) =>
    authorizeFormAnswerRead(db, { id: staff.id, role: staff.role }, answer)));
  if (allowed.some((value) => !value)) notFound();
  return (
    <div>
      <ReviewBackLink returnTo={returnTo} actorId={staff.id}/>
      <div className="mt-6 flex flex-wrap justify-between gap-4">
        <div>
          <AdminPageTitle><h1 className="font-heading text-4xl">{item.productName}</h1></AdminPageTitle>
          <p className="mt-2 text-sm text-muted-foreground">{item.referenceNumber}</p><OrderOfferDetails offer={item.offerSnapshot}/><ReturnPhysicalSummary value={item.physical}/>
          <p className="mt-2 text-sm text-muted-foreground">
            Order {item.orderNumber} · sold by {item.sellerName}
          </p>
        </div>
        <Status value={item.status} />
      </div>
      {can(staff,'refund.approve.standard')&&item.refundStatus?<Link className="mt-4 block underline" href={withAdminReturnTo('/admin/payments/refunds?case='+encodeURIComponent(item.id),detailHref)}>Review original refund funding and actual payment</Link>:null}
      <StaffFormHistoryLinks returnTo={detailHref} entries={[{kind:'return-case-action',subjectId:id,label:'Staff decision answers'}]} />
      <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          {courierReview && (courierReview.expenses.length > 0 || courierReview.needsPricingReconciliation) ? <section className="space-y-3 rounded-2xl border bg-card p-6" aria-label="Recorded courier expenses">
            <h2 className="font-heading text-2xl">Recorded courier expenses</h2>
            {courierReview.needsPricingReconciliation ? <p>The saved buyer price needs reconciliation. Review the courier invoices separately.</p> : null}
            <p>These shipment costs are separate from the original delivery amount paid by the customer. Review the contract and evidence before assigning any seller liability.</p>
            {courierReview.expenses.length > 0 ? <ul className="space-y-2">{courierReview.expenses.map(expense=><li key={expense.id}>
              {expense.direction==='outbound'?'Outbound':'Return'} · {formatPaisaExact(expense.amountPaisa)} · Evidence: {expense.evidenceReference}
              {expense.claimReference?` · Carrier claim: ${expense.claimReference}`:null}
            </li>)}</ul> : null}
          </section>:null}
          <section className="space-y-4 rounded-2xl border bg-card p-6" aria-label="Return form answer history">
            <h2 className="font-heading text-2xl">Form answer history</h2>
            <nav className="flex gap-4 text-sm"><Link className="underline" href={withAdminReturnTo(`/admin/cases/returns/${encodeURIComponent(id)}`,returnTo)}>Customer request</Link>
              <Link className="underline" href={withAdminReturnTo(`/admin/cases/returns/${encodeURIComponent(id)}?historyKind=seller`,returnTo)}>Seller response</Link></nav>
            {history.answers.length ? history.answers.map((answer) => <AnswerDetails key={answer.id} answer={answer} />)
              : <p>No saved answers for this action.</p>}
            {history.nextCursor ? <Link className="underline" href={
              withAdminReturnTo(`/admin/cases/returns/${encodeURIComponent(id)}?historyKind=${kind}&historyAt=${history.nextCursor.createdAt}&historyId=${encodeURIComponent(history.nextCursor.id)}`,returnTo)
            }>Next 50 answers</Link> : null}
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Request and eligibility</h2>
            <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Reason">{item.reason.replaceAll('_', ' ')}</Detail>
              <Detail label="Resolution requested">
                {item.requestedResolution}
              </Detail>
              <Detail label="Quantity">
                {item.quantity} of {item.itemQuantity}
              </Detail>
              <Detail label="Automated eligibility">
                {item.eligibilityDecision}
              </Detail>
              <Detail label="Original seal reported intact">
                {item.originalSealIntact ? 'Yes — verify during review' : 'No'}
              </Detail>
              {item.pricingEntitlement?.kind === 'ready' ? (
                <>
                  <Detail label="Saved refundable item amount">{formatPaisaExact(item.pricingEntitlement.itemPaisa)}</Detail>
                  <Detail label={item.pricingEntitlement.canRetainVoluntaryDelivery ? "Original delivery share" : "Applicable original delivery refund"}>{formatPaisaExact(item.pricingEntitlement.deliveryPaisa)}</Detail>
                </>
              ) : item.pricingEntitlement?.kind === 'needs_reconciliation' ? (
                <Detail label="Buyer refund amounts">Original amounts need reconciliation.</Detail>
              ) : <Detail label="Item value">{money(item.lineTotalPaisa || 0)}</Detail>}
              <Detail label="Original delivery charge (order snapshot)">
                {money(item.deliveryChargePaisa || 0)}
              </Detail>
            </dl>
            <p className="mt-5 rounded-xl bg-muted/35 p-4 text-sm leading-6">
              {item.eligibilityReasonEn}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
              {item.detail}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Parties and evidence</h2>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Customer contact">
                <span className="normal-case">
                  {item.customerEmail}
                  <br />
                  {item.customerPhone}
                </span>
              </Detail>
              <Detail label="Seller response">
                <span className="normal-case">
                  {item.sellerResponse || 'Awaiting response or not required'}
                </span>
              </Detail>
            </div>
            <h3 className="mt-6 flex items-center gap-2 font-semibold">
              <Paperclip className="size-4 text-primary" />
              Private evidence
            </h3>
            {item.evidence.length ? (
              <ul className="mt-3 space-y-2">
                {item.evidence.map((file) => (
                  <li key={file.id}>
                    <a
                      className="text-sm font-semibold text-primary hover:underline"
                      href={`/api/return-evidence/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.originalName} · {Math.ceil(file.sizeBytes / 1024)}{' '}
                      KB
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No files supplied. Review the available customer, seller and carrier evidence. Missing optional photos alone cannot establish fault or justify rejecting the claim.
              </p>
            )}
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
                  <div className="flex flex-wrap gap-2">
                    <Status value={event.toStatus} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString('en-NP')} ·{' '}
                      {event.actorType.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{event.publicMessageEn}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Decision and operations</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Amounts are entered in NPR and stored as integer paisa. {staff.role==='super_admin'?'Your refund review applies approval directly, including high-value refunds. Refund processing remains a separate action.':'High-value refunds reviewed by an Admin require Super Admin confirmation.'}
            </p>
            <div className="mt-5">
              {item.handling&&can(staff,'order.manage')?<ReturnHandlingActions workspace={item.handling} actorId={staff.id} superAdmin={staff.role==='super_admin'}/>:null}
              {item.staffFollowup&&(can(staff,'support.manage')||can(staff,'order.manage'))?<AftercareFollowupActions sourceType='return_request' source={item.staffFollowup} actorId={staff.id}/>:null}
              <ReturnCaseActions
                actorId={staff.id}
                id={item.id}
                status={item.status}
                outcome={item.resolutionOutcome}
                refundStatus={item.refundStatus}
                role={staff.role}
                canApproveStandard={can(staff, 'refund.approve.standard')}
                quantity={item.quantity}
                deliveryEntitlement={item.deliveryEntitlement}
                pricingEntitlement={item.pricingEntitlement}
              />
            </div>
          </section>
          {item.refundId ? (
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="font-heading text-2xl">Refund record</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt>Cash to refund</dt>
                  <dd>{money(item.refundCashPaisa ?? 0)}</dd>
                </div>
                <div className="flex justify-between"><dt>Shopping credit to restore</dt><dd>{money(item.refundWalletPaisa || 0)}</dd></div>
                <div className="flex justify-between"><dt>Referral discount (not refundable)</dt><dd>{money(item.refundDiscountPaisa || 0)}</dd></div>
                <div className="flex justify-between"><dt>Promo savings (not refundable)</dt><dd>{money(item.refundPromoPaisa || 0)}</dd></div>
                <p className="text-xs leading-5 text-muted-foreground">Refund only the cash amount shown. Shopping credit is restored automatically when this refund is completed. For a credit-only refund, use an internal completion reference.</p>
                <div className="flex justify-between">
                  <dt>Status</dt>
                  <dd className="capitalize">
                    {item.refundStatus?.replaceAll('_', ' ')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>High value</dt>
                  <dd>{item.isHighValue ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Reference</dt>
                  <dd>{item.refundProviderReference || '—'}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
function money(paisa: number) {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}
function Status({ value }: { value: string }) {
  return (
    <span className="h-fit rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold capitalize">
      {value.replaceAll('_', ' ')}
    </span>
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
      <dd className="mt-1 capitalize">{children}</dd>
    </div>
  );
}

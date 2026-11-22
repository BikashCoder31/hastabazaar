import { AlertTriangle, Clock3, Phone, Undo2, X } from 'lucide-react';
import Link from 'next/link';
import { StaffReviewAccessBoundary } from '@/components/admin/staff-review-access-boundary';
import { OrderPreparationWorkspace } from '@/components/commerce/order-preparation-workspace';
import { NextStepBox } from '@/components/ui/next-step-box';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { readPreparationWorkspace } from '@/lib/orders/response-workspace';
import { deliveryFailureReasonLabel, deliveryFailureReasons } from '@/lib/shipping/delivery-failure';
import { ParcelProblemAction } from './parcel-problem-action';
import { problemFilters, problemHref, readParcelProblems, type ParcelProblem, type ProblemFilter, type ProblemReasonFilter } from './parcel-problems';

const icons = { delay: Clock3, cannot_fulfill: AlertTriangle, delivery_failed: Phone, refused: X, return_to_origin: Undo2 };
const nextLabel = {
  delay: 'Update customer', cannot_fulfill: 'Check order options', delivery_failed: 'Contact customer',
  refused: 'Review evidence', return_to_origin: 'Confirm arrival',
};
const refusalReasons: Record<string, string> = {
  refused_whole_parcel_wrong_item: 'Wrong item',
  refused_whole_parcel_damage: 'Damage',
  refused_whole_parcel_other: 'Other reason',
};
const pill = 'inline-flex w-fit max-w-full items-center rounded-full px-2.5 py-1 text-xs leading-tight font-semibold';
const linkStyle = 'inline-flex min-h-11 items-center py-2 text-sm font-semibold underline underline-offset-4 hover:text-[#A8232E]';
const panel = 'min-w-0 rounded-2xl border border-[#E4DACA] bg-white';
const reasonFilters: ReadonlyArray<readonly [ProblemReasonFilter, string]> = [
  ['all', 'All reasons'],
  ...deliveryFailureReasons.map(([reason]) => [reason, deliveryFailureReasonLabel(reason)] as const),
  ['unrecorded', 'Reason not recorded'],
];
const readyDate = new Intl.DateTimeFormat('en-NP', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kathmandu' });
const recordDate = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kathmandu' });

function title(problem: ParcelProblem) {
  switch (problem.kind) {
    case 'delay': return problem.readyAt === null ? 'Seller delay' : `New ready date: ${readyDate.format(problem.readyAt)}`;
    case 'cannot_fulfill': return 'Seller can’t fulfil this order';
    case 'delivery_failed': return 'Delivery failed';
    case 'refused': return 'Customer refused the parcel';
    case 'return_to_origin': return 'Coming back to seller';
  }
}

function nextAction(problem: ParcelProblem) {
  if (problem.followup) return problem.followup;
  switch (problem.kind) {
    case 'delay': return 'Review the proposed ready date and record what you tell the customer.';
    case 'cannot_fulfill': return 'Confirm the affected items and review cancellation or other options on the order. Record the next update for the customer.';
    case 'delivery_failed': return 'Contact the customer and confirm with the courier whether to try delivery again or send the parcel back.';
    case 'refused': return 'Review the recorded reason and the order before deciding whether to open a return or complaint.';
    case 'return_to_origin': return 'Wait for the parcel to arrive and confirm receipt with the seller. Record any damage in the appropriate follow-up.';
  }
}

function ProblemBadge({ problem }: { problem: ParcelProblem }) {
  const color = problem.kind === 'return_to_origin' ? 'bg-[#E3E9F4] text-[#244577]' : problem.kind === 'delay'
    ? 'bg-[#14213D] text-white' : 'bg-[#A8232E] text-white';
  return <span className={`${pill} ${color}`}>{nextLabel[problem.kind]}</span>;
}

function FailureReasonBadge({ problem }: { problem: ParcelProblem }) {
  return problem.courierFailure ? <span className={`${pill} bg-[#F7F3EC] text-[#46536F]`}>{deliveryFailureReasonLabel(problem.failureReason)}</span> : null;
}

async function renderProblemDetail({ problem, db, viewer, returnTo }: {
  problem: ParcelProblem;
  db: D1Database;
  viewer: { id: string; authSubject?: string | null };
  returnTo: string;
}) {
  const workspace = problem.source === 'preparation'
    ? await readPreparationWorkspace(db, viewer.id, problem.sourceId, 'staff', { actorAuthSubject: viewer.authSubject })
    : null;
  const caseExists = workspace?.portions.some(portion => portion.cases.some(entry => entry.id === problem.sourceId));
  const orderPath = `/admin/orders/${encodeURIComponent(problem.orderId)}`;
  const orderHref = withAdminReturnTo(problem.source === 'preparation' ? orderPath : `${orderPath}?tab=parcel-cash#courier`, returnTo);
  const showAction = problem.source === 'job' && problem.version !== null && ['delivery_failed', 'returning'].includes(problem.state);
  const evidence = [problem.courierName, problem.trackingCode, refusalReasons[problem.state]].filter(Boolean);

  return <section id="problem-detail" aria-labelledby="problem-heading" className={`${panel} scroll-mt-20 space-y-4 p-5 sm:p-6`}>
    <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2.5">
      <div className="min-w-0">
        <p className="font-mono text-[13px] break-words text-[#46536F]">{problem.orderNumber}{problem.sellerName ? ` · ${problem.sellerName}` : ''}</p>
        <h2 id="problem-heading" className="mt-1 font-heading text-[25px] leading-tight font-semibold tracking-tight" tabIndex={-1}>{title(problem)}</h2>
      </div>
      <div className="flex flex-wrap gap-2"><ProblemBadge problem={problem} /><FailureReasonBadge problem={problem} /></div>
    </div>
    {evidence.length ? <p className="text-sm break-words text-[#46536F]">{evidence.join(' · ')}</p> : null}
    {problem.note ? <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-[#46536F]">{problem.note}</p> : null}
    {problem.source !== 'preparation' ? <p className="text-sm text-[#46536F]">{problem.source === 'refusal' ? 'Reported' : 'Updated'} {recordDate.format(problem.occurredAt)} Nepal time</p> : null}
    <NextStepBox title="What to do" className="break-words">{nextAction(problem)}</NextStepBox>
    {showAction ? <ParcelProblemAction key={`${problem.id}:${problem.version}`} actorId={viewer.id} orderId={problem.orderId} jobId={problem.sourceId}
      version={Number(problem.version)} returning={problem.state === 'returning'} /> : null}
    {workspace && caseExists ? <OrderPreparationWorkspace workspace={workspace} problemCaseId={problem.sourceId} /> : null}
    <div className="flex flex-wrap gap-x-4 border-t border-[#E4DACA] pt-1">
      <Link href={orderHref} className={linkStyle}>Open order</Link>
      {problem.source === 'job' ? <Link href={withAdminReturnTo(`${orderPath}?tab=parcel-cash#exceptions`, returnTo)} className={linkStyle}>Review exception follow-up</Link> : null}
      {problem.source === 'refusal' ? <Link href="/admin/riders?view=records" className={linkStyle}>View historical refusal reports</Link> : null}
      {problem.source === 'preparation' && caseExists ? <Link href={withAdminReturnTo(`/admin/order-responses/${encodeURIComponent(problem.sourceId)}`, returnTo)} className={linkStyle}>Open preparation record</Link> : null}
    </div>
  </section>;
}

export async function renderParcelProblemQueue({ db, viewer, superAdmin, kind, requestedPage, selected, requestedReason }: {
  db: D1Database;
  viewer: { id: string; authSubject?: string | null };
  superAdmin: boolean;
  kind: ProblemFilter;
  requestedPage?: string;
  selected?: string;
  requestedReason?: string;
}) {
  const { problems, countByKind, page, pageCount, reason, failureReasonsAvailable } = await readParcelProblems(db, { superAdmin, kind, requestedPage, reason: requestedReason });
  const current = problems.find(problem => problem.id === selected) ?? problems[0];
  const detail = current ? await renderProblemDetail({ problem: current, db, viewer, returnTo: problemHref(kind, page, current.id, reason) }) : null;
  return <StaffReviewAccessBoundary actorId={viewer.id} sourceId="parcel-problems">
    <section aria-label="Parcel problems" className="space-y-4">
      <nav aria-label="Filter parcel problems" className="flex flex-wrap gap-2.5">
        {problemFilters.map(([key, label]) => (
          <Link key={key} href={problemHref(key, 1, undefined, reason)} scroll={false} aria-current={kind === key ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold ${kind === key
              ? 'border-[#14213D] bg-[#14213D] text-white' : 'border-[#D3C5AD] bg-white text-[#46536F] hover:border-[#14213D]'}`}>
            {label} <span className="tabular-nums opacity-80">{countByKind.get(key) ?? 0}</span>
          </Link>
        ))}
      </nav>
      {failureReasonsAvailable ? <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Filter by delivery failure reason" className="flex flex-wrap gap-x-3 gap-y-1">
          {reasonFilters.map(([key, label]) => (
            <Link key={key} href={problemHref(kind, 1, undefined, key)} scroll={false}
              aria-current={reason === key ? 'page' : undefined}
              className={`${linkStyle} ${reason === key ? 'text-[#A8232E]' : ''}`}>{label}</Link>
          ))}
        </nav>
        <Link href="/admin/orders/dispatch?lane=courier" className={linkStyle}>Find a parcel with a courier</Link>
      </div> : null}
      {current ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.91fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <ul aria-label="Problems" className={`${panel} overflow-hidden divide-y divide-[#E4DACA]`}>
              {problems.map((problem) => {
                const Icon = icons[problem.kind];
                const active = current.id === problem.id;
                const warm = problem.kind === 'delay' || problem.kind === 'return_to_origin';
                return <li key={problem.id}>
                  <Link href={`${problemHref(kind, page, problem.id, reason)}#problem-detail`} prefetch={false} aria-current={active ? 'true' : undefined}
                    className={`relative flex min-h-18 flex-wrap items-center gap-x-3.5 gap-y-2 py-3 pr-3.5 pl-[17px] text-sm hover:bg-[#F7F3EC] focus-visible:-outline-offset-2 sm:flex-nowrap sm:pr-4 sm:pl-[19px] ${active ? 'bg-[#FFFCF7] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[#A8232E]' : ''}`}>
                    <Icon className={`size-9.5 shrink-0 rounded-[10px] p-2.5 ${warm ? 'bg-[#F7E9C9] text-[#8A5A0B]' : 'bg-[#F8E1DE] text-[#A8232E]'}`} aria-hidden="true" />
                    <span className="min-w-0 grow basis-[45%] break-words sm:basis-auto">
                      <span className="block font-semibold">{title(problem)}</span>
                      <span className="mt-0.5 block text-[13px] text-[#46536F]">{[problem.orderNumber, problem.sellerName, problem.trackingCode, refusalReasons[problem.state]].filter(Boolean).join(' · ')}</span>
                      {problem.followup ? <span className="mt-0.5 line-clamp-2 text-[13px] text-[#46536F]">{problem.followup}</span> : null}
                      <FailureReasonBadge problem={problem} />
                    </span>
                    <span className="max-w-full shrink-0"><ProblemBadge problem={problem} /></span>
                  </Link>
                </li>;
              })}
            </ul>
            {pageCount > 1 ? <nav aria-label="Parcel problems pages" className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {page > 1 ? <Link href={problemHref(kind, page - 1, undefined, reason)} className={linkStyle}>Previous</Link> : <span />}
              <span>Page {page} of {pageCount}</span>
              {page < pageCount ? <Link href={problemHref(kind, page + 1, undefined, reason)} className={linkStyle}>Next</Link> : <span />}
            </nav> : null}
          </div>
          {detail}
        </div>
      ) : <p className={`${panel} p-5 text-sm text-[#46536F]`}>{kind === 'all' && reason === 'all' ? 'No active parcel problems.' : 'No active problems match this filter.'}</p>}
    </section>
  </StaffReviewAccessBoundary>;
}
